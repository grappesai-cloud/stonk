// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Votarea pe gauge-uri, ca sa avem pe ce proba Lobbyist-ul.
 *
 * Partile care conteaza si care schimba comportamentul agentului:
 *  - votul e RESERVAT proprietarului blocarii. Asa si trebuie: altfel ar putea
 *    vota oricine cu pozitia ta. De aia diagnosticul Lobbyist-ului intreaba
 *    "putem NOI", nu "poate un strain".
 *  - exista o fereastra: inainte de ea votul se respinge, dupa inchidere la
 *    fel. Un agent care voteaza cand ii vine lui nu voteaza niciodata.
 *  - cat incasezi depinde de cati au votat inaintea ta pe acelasi gauge, deci
 *    aceeasi putere aduce alti bani in functie de unde o pui.
 */
contract MockGauges {
    error NotLockOwner(uint256 tokenId);
    error VotingClosed(uint256 epochEnd);
    error BadWeights();

    event Voted(uint256 indexed tokenId, address indexed gauge, uint256 weight);
    event Claimed(uint256 indexed tokenId, address indexed to, uint256 amount);

    address public owner;
    uint256 public epochEnd;
    uint256 public epochLength;
    /** cu cat timp inainte de inchidere se poate vota */
    uint256 public voteWindow;

    uint256 public nextLockId = 1;
    mapping(uint256 => address) public lockOwner;
    mapping(uint256 => uint256) public power;

    address[] internal gaugeList;
    mapping(address => uint256) public bribesOf;
    mapping(address => uint256) public votesOf;
    mapping(uint256 => mapping(address => uint256)) public voteOf; // lock -> gauge -> weight
    mapping(uint256 => address[]) internal votedGauges;
    mapping(uint256 => uint256) public claimable;

    constructor(uint256 _epochLength, uint256 _voteWindow) {
        owner = msg.sender;
        epochLength = _epochLength;
        voteWindow = _voteWindow;
        epochEnd = block.timestamp + _epochLength;
    }

    receive() external payable {}

    function mintLock(address to, uint256 amount) external returns (uint256 id) {
        id = nextLockId++;
        lockOwner[id] = to;
        power[id] = amount;
    }

    function addGauge(address gauge, uint256 bribe, uint256 existingVotes) external {
        gaugeList.push(gauge);
        bribesOf[gauge] = bribe;
        votesOf[gauge] = existingVotes;
    }

    function gauges() external view returns (address[] memory) {
        return gaugeList;
    }

    function balanceOfNFT(uint256 tokenId) external view returns (uint256) {
        return power[tokenId];
    }

    function vote(uint256 tokenId, address[] calldata targets, uint256[] calldata weights) external {
        if (lockOwner[tokenId] != msg.sender) revert NotLockOwner(tokenId);
        if (block.timestamp + voteWindow < epochEnd) revert VotingClosed(epochEnd);
        if (block.timestamp >= epochEnd) revert VotingClosed(epochEnd);
        if (targets.length == 0 || targets.length != weights.length) revert BadWeights();

        uint256 total;
        for (uint256 i = 0; i < weights.length; i++) total += weights[i];
        if (total == 0) revert BadWeights();

        uint256 p = power[tokenId];
        for (uint256 i = 0; i < targets.length; i++) {
            uint256 share = (p * weights[i]) / total;
            votesOf[targets[i]] += share;
            voteOf[tokenId][targets[i]] += share;
            votedGauges[tokenId].push(targets[i]);
            emit Voted(tokenId, targets[i], share);
        }
    }

    /** inchide epoca si imparte mita dupa voturi */
    function rollEpoch() external {
        for (uint256 g = 0; g < gaugeList.length; g++) {
            address gauge = gaugeList[g];
            uint256 total = votesOf[gauge];
            if (total == 0) continue;
            for (uint256 id = 1; id < nextLockId; id++) {
                uint256 mine = voteOf[id][gauge];
                if (mine == 0) continue;
                claimable[id] += (bribesOf[gauge] * mine) / total;
                voteOf[id][gauge] = 0;
            }
            votesOf[gauge] = 0;
        }
        epochEnd = block.timestamp + epochLength;
    }

    function claim(uint256 tokenId) external {
        if (lockOwner[tokenId] != msg.sender) revert NotLockOwner(tokenId);
        uint256 amount = claimable[tokenId];
        claimable[tokenId] = 0;
        emit Claimed(tokenId, msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "claim failed");
    }
}
