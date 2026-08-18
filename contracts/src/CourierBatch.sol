// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * CourierBatch: gruparea livrarilor intr-o singura tranzactie.
 *
 * Trei lucruri pe care un multicall generic nu ti le da:
 *  1. o livrare care da revert nu darama tot lotul (o cursa pierduta e normala,
 *     nu e eroare),
 *  2. plafon de gaz pe apel, ca un contract prost sa nu inghita tot lotul,
 *  3. bacsisurile aterizeaza aici in timpul lotului si sunt impartite atomic
 *     intre portofelul agentului si trezorerie.
 *
 * Contractul NU tine fonduri intre tranzactii: la finalul fiecarui `run` isi
 * goleste soldul. Nu are proprietar, nu are functie de upgrade si nu poate
 * atinge fondurile nimanui. Singurul lucru pe care il poate face cineva rau
 * intentionat cu el e sa cheme aceleasi functii publice pe care le putea chema
 * si direct.
 */
contract CourierBatch {
    address public immutable treasury;
    uint16 public immutable feeBps; // taxa din BACSIS, niciodata din valoarea livrata

    uint256 private _lock = 1;

    error FeeTooHigh();
    error NoBeneficiary();
    error Reentrant();
    error PayoutFailed();

    event BatchRun(
        address indexed target,
        address indexed beneficiary,
        uint256 total,
        uint256 succeeded,
        uint256 tips,
        uint256 fee
    );

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

        ok = new bool[](calls.length);
        uint256 succeeded;

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

        tips = address(this).balance;
        if (tips > 0) {
            fee = (tips * feeBps) / 10_000;
            if (fee > 0) {
                (bool f,) = treasury.call{value: fee}("");
                if (!f) revert PayoutFailed();
            }
            uint256 rest = tips - fee;
            if (rest > 0) {
                (bool b,) = beneficiary.call{value: rest}("");
                if (!b) revert PayoutFailed();
            }
        }

        emit BatchRun(target, beneficiary, calls.length, succeeded, tips, fee);
    }

    /// praf ramas din apeluri directe, ajunge la trezorerie. Oricine poate chema.
    function sweep() external {
        uint256 b = address(this).balance;
        if (b > 0) {
            (bool s,) = treasury.call{value: b}("");
            if (!s) revert PayoutFailed();
        }
    }

    receive() external payable {}
}
