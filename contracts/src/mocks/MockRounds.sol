// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Rundele care asteapta randomness, ca sa avem pe ce proba Miner-ul.
 *
 * Contine dinadins AMBELE lumi din care se decide daca meseria exista:
 *
 *  - `settle(id)` e libera: dupa ce randomness-ul a sosit, oricine poate
 *    inchide runda si isi ia rasplata. Aici Miner are ce cauta.
 *  - `fulfillRandomWords(id, words)` e a oracolului si cere niste cuvinte pe
 *    care nu le putem produce. Aici Miner NU exista, si niciun cod nu schimba
 *    asta. Diagnosticul trebuie sa faca diferenta intre cele doua.
 */
contract MockRounds {
    error NotOracle();
    error NotReady(uint256 id);
    error AlreadySettled(uint256 id);

    event RoundOpened(uint256 indexed id, uint256 bounty);
    event RandomnessDelivered(uint256 indexed id);
    event Settled(uint256 indexed id, address indexed settler, uint256 bounty);

    /** 0 = nu exista, 1 = asteapta randomness, 2 = gata de inchis, 3 = inchisa */
    struct Round {
        uint8 status;
        uint256 bounty;
        uint256 pot;
        uint256 word;
    }

    address public owner;
    address public oracle;
    uint256 public nextRoundId = 1;
    mapping(uint256 => Round) internal rounds;
    uint256[] internal openIds;

    constructor(address _oracle) {
        owner = msg.sender;
        oracle = _oracle;
    }

    function open(uint256 bounty, uint256 potAmount) external payable returns (uint256 id) {
        id = nextRoundId++;
        rounds[id] = Round({status: 1, bounty: bounty, pot: potAmount, word: 0});
        openIds.push(id);
        emit RoundOpened(id, bounty);
    }

    /** oracolul livreaza randomness; de aici incolo oricine poate inchide */
    function deliverRandomness(uint256 id, uint256 word) external {
        if (msg.sender != oracle) revert NotOracle();
        Round storage r = rounds[id];
        if (r.status != 1) revert NotReady(id);
        r.status = 2;
        r.word = word;
        emit RandomnessDelivered(id);
    }

    /**
     * Functia oracolului, cu argumente care nu sunt ale noastre. Exista aici
     * ca sa poata fi dovedit ca unealta o recunoaste si spune ca nu se poate.
     */
    function fulfillRandomWords(uint256 id, uint256[] calldata words) external {
        if (msg.sender != oracle) revert NotOracle();
        Round storage r = rounds[id];
        if (r.status != 1) revert NotReady(id);
        r.status = 2;
        r.word = words.length > 0 ? words[0] : 0;
        emit RandomnessDelivered(id);
    }

    /** libera: oricine inchide o runda gata si isi ia rasplata */
    function settle(uint256 id) external {
        Round storage r = rounds[id];
        if (r.status == 3) revert AlreadySettled(id);
        if (r.status != 2) revert NotReady(id);
        r.status = 3;
        uint256 bounty = r.bounty;
        _removeOpen(id);
        emit Settled(id, msg.sender, bounty);
        (bool ok,) = msg.sender.call{value: bounty}("");
        require(ok, "bounty failed");
    }

    function roundOf(uint256 id) external view returns (uint8 status, uint256 bounty, uint256 pot) {
        Round storage r = rounds[id];
        return (r.status, r.bounty, r.pot);
    }

    /** rundele deschise, indiferent daca au sau nu randomness */
    function pendingRounds() external view returns (uint256[] memory) {
        return openIds;
    }

    function _removeOpen(uint256 id) internal {
        uint256 n = openIds.length;
        for (uint256 i = 0; i < n; i++) {
            if (openIds[i] == id) {
                openIds[i] = openIds[n - 1];
                openIds.pop();
                return;
            }
        }
    }

    receive() external payable {}
}
