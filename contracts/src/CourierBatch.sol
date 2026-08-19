// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * CourierBatch: gruparea livrarilor intr-o singura tranzactie.
 *
 * Trei lucruri pe care un multicall generic nu ti le da:
 *  1. o livrare care da revert nu darama tot lotul (o cursa pierduta e normala,
 *     nu e eroare),
 *  2. plafon de gaz pe apel, ca un contract prost sa nu inghita tot lotul,
 *  3. bacsisurile aterizeaza aici in timpul lotului si sunt impartite atomic,
 *     fie catre un singur beneficiar, fie catre flota, fiecare agent la
 *     portofelul lui.
 *
 * Impartirea pe flota (`runSplit`) e motivul pentru care colectia poate spune
 * "bucata ta a castigat atat" fara sa minta: plata nu e o promisiune tinuta
 * intr-un registru de-al nostru, e o tranzactie pe lant catre portofelul 6551
 * al fiecarui agent, in aceeasi tranzactie cu munca.
 *
 * Contractul nu are proprietar, nu are upgrade si nu poate atinge fondurile
 * nimanui. Tine bani intre tranzactii doar intr-un singur caz: cand o plata
 * catre cineva a esuat (portofelul lui refuza ETH sau cere prea mult gaz).
 * Atunci suma ii ramane creditata in `owed` si oricine o poate impinge inapoi
 * cu `withdraw`. Alternativa ar fi fost sa cada tot lotul din cauza unui singur
 * portofel prost, adica un agent stricat sa opreasca munca intregii flote.
 */
contract CourierBatch {
    address public immutable treasury;
    uint16 public immutable feeBps; // taxa din BACSIS, niciodata din valoarea livrata

    /** cui ii datoram, pentru ca plata directa a esuat */
    mapping(address => uint256) public owed;
    /** cat din soldul contractului e deja promis cuiva; `sweep` nu are voie sa il atinga */
    uint256 public totalOwed;

    uint256 private _lock = 1;
    /** gaz dat unei plati; peste atat, suma se crediteaza in loc sa blocheze lotul */
    uint256 private constant PAYOUT_GAS = 60_000;

    struct Share {
        address payable to;
        uint32 bps;
    }

    error FeeTooHigh();
    error NoBeneficiary();
    error Reentrant();
    error PayoutFailed();
    error BadShares();
    error NothingOwed();

    event BatchRun(
        address indexed target,
        address indexed beneficiary,
        uint256 total,
        uint256 succeeded,
        uint256 tips,
        uint256 fee
    );

    /** o plata catre un agent; `pushed` fals inseamna ca a ramas creditata in owed */
    event TipPaid(address indexed to, uint256 amount, bool pushed);

    constructor(address _treasury, uint16 _feeBps) {
        if (_feeBps > 3000) revert FeeTooHigh(); // plafon dur, 30% din bacsis
        treasury = _treasury;
        feeBps = _feeBps;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrant();
        _lock = 2;
        _;
        _lock = 1;
    }

    /**
     * Un singur beneficiar. Ramane pentru cazul cu un singur agent.
     *
     * @param target contractul de drop-uri
     * @param calls  calldata deja codificata pentru fiecare livrare
     * @param gasCap gaz maxim pe apel (0 = fara plafon)
     * @param beneficiary unde pleaca bacsisurile, de obicei portofelul 6551 al agentului
     */
    function run(address target, bytes[] calldata calls, uint256 gasCap, address payable beneficiary)
        external
        nonReentrant
        returns (bool[] memory ok, uint256 tips, uint256 fee)
    {
        if (beneficiary == address(0)) revert NoBeneficiary();

        uint256 succeeded;
        (ok, succeeded) = _execute(target, calls, gasCap);

        uint256 rest;
        (tips, fee, rest) = _takeFee();
        if (rest > 0) _pay(beneficiary, rest);

        emit BatchRun(target, beneficiary, calls.length, succeeded, tips, fee);
    }

    /**
     * Acelasi lot, dar bacsisul se imparte intre mai multi agenti, fiecare la
     * portofelul lui, in aceeasi tranzactie.
     *
     * Cotele se dau in miimi de procent si trebuie sa insumeze exact 10000.
     * Restul din impartirea intreaga merge la prima cota, ca sa nu ramana praf
     * neatribuit: suma platita e mereu egala cu suma de impartit.
     */
    function runSplit(address target, bytes[] calldata calls, uint256 gasCap, Share[] calldata shares)
        external
        nonReentrant
        returns (bool[] memory ok, uint256 tips, uint256 fee)
    {
        uint256 n = shares.length;
        if (n == 0) revert BadShares();

        uint256 sum;
        for (uint256 i = 0; i < n; i++) {
            if (shares[i].to == address(0)) revert NoBeneficiary();
            sum += shares[i].bps;
        }
        if (sum != 10_000) revert BadShares();

        uint256 succeeded;
        (ok, succeeded) = _execute(target, calls, gasCap);

        uint256 rest;
        (tips, fee, rest) = _takeFee();

        if (rest > 0) {
            uint256 paid;
            /* intai toate cotele in afara de prima, apoi prima ia ce a mai
               ramas: asa restul din impartire nu se pierde si nu se inventeaza */
            for (uint256 i = 1; i < n; i++) {
                uint256 amount = (rest * shares[i].bps) / 10_000;
                if (amount > 0) {
                    paid += amount;
                    _pay(shares[i].to, amount);
                }
            }
            _pay(shares[0].to, rest - paid);
        }

        emit BatchRun(target, shares[0].to, calls.length, succeeded, tips, fee);
    }

    /** impinge inapoi o suma care nu a putut fi platita direct. Oricine poate chema. */
    function withdraw(address payable to) external {
        uint256 amount = owed[to];
        if (amount == 0) revert NothingOwed();
        owed[to] = 0;
        totalOwed -= amount;
        (bool s,) = to.call{value: amount}("");
        if (!s) revert PayoutFailed();
    }

    /// praf ramas din apeluri directe, ajunge la trezorerie. Nu atinge ce e datorat cuiva.
    function sweep() external {
        uint256 b = address(this).balance;
        uint256 free = b > totalOwed ? b - totalOwed : 0;
        if (free > 0) {
            (bool s,) = treasury.call{value: free}("");
            if (!s) revert PayoutFailed();
        }
    }

    // ------------------------------------------------------------- interne

    function _execute(address target, bytes[] calldata calls, uint256 gasCap)
        private
        returns (bool[] memory ok, uint256 succeeded)
    {
        ok = new bool[](calls.length);
        for (uint256 i = 0; i < calls.length; i++) {
            bool s;
            if (gasCap == 0) {
                (s,) = target.call(calls[i]);
            } else {
                (s,) = target.call{gas: gasCap}(calls[i]);
            }
            ok[i] = s;
            if (s) succeeded++;
        }
    }

    /**
     * Cat a intrat in lotul asta si cat ia trezoreria. Se scade ce e deja
     * datorat altcuiva, ca banii unei livrari esuate sa nu fie impartiti a doua
     * oara ca bacsis proaspat.
     */
    function _takeFee() private returns (uint256 tips, uint256 fee, uint256 rest) {
        uint256 b = address(this).balance;
        tips = b > totalOwed ? b - totalOwed : 0;
        if (tips == 0) return (0, 0, 0);

        fee = (tips * feeBps) / 10_000;
        if (fee > 0) _pay(payable(treasury), fee);
        rest = tips - fee;
    }

    /**
     * Plata cu plafon de gaz. Daca nu intra, sumei i se face credit in loc sa
     * cada lotul: un portofel care refuza ETH e problema lui, nu a celorlalti
     * agenti din aceeasi tranzactie.
     */
    function _pay(address payable to, uint256 amount) private {
        (bool s,) = to.call{value: amount, gas: PAYOUT_GAS}("");
        if (!s) {
            owed[to] += amount;
            totalOwed += amount;
        }
        emit TipPaid(to, amount, s);
    }

    receive() external payable {}
}
