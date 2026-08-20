// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Butonul Clock In, ca sa avem pe ce proba Ringer-ul.
 *
 * Nu e o jucarie pentru teste verzi: are exact partile de care depinde
 * meseria. Oala creste, exista o fereastra dupa care se poate apasa, cine
 * apasa primeste un procent, si apasarea emite un eveniment cu adresa lui.
 * Fara evenimentul ala nu se poate tine caietul de curse.
 *
 * `restricted` exista dinadins: cu el pornit, functia devine rezervata
 * proprietarului, si asa se poate dovedi ca diagnosticul chiar prinde cazul in
 * care agentul NU poate exista.
 */
contract MockClock {
    error NotAuthorized();
    error NotReady(uint256 nextAt);
    error EmptyPot();

    event ClockIn(address indexed caller, uint256 pot, uint256 tip);

    address public owner;
    address public oracle;
    uint256 public pot;
    uint256 public nextAt;
    uint256 public period;
    uint256 public minPot;
    uint256 public tipBps;
    bool public restricted;
    uint256 public presses;

    constructor(uint256 _period, uint256 _minPot, uint256 _tipBps) {
        owner = msg.sender;
        period = _period;
        minPot = _minPot;
        tipBps = _tipBps;
        nextAt = block.timestamp;
    }

    receive() external payable {
        pot += msg.value;
    }

    function fund() external payable {
        pot += msg.value;
    }

    function setRestricted(bool v) external {
        if (msg.sender != owner) revert NotAuthorized();
        restricted = v;
    }

    function setNextAt(uint256 v) external {
        if (msg.sender != owner) revert NotAuthorized();
        nextAt = v;
    }

    /** cat ia cel care apasa acum */
    function clockInTip() public view returns (uint256) {
        return (pot * tipBps) / 10_000;
    }

    function canClockIn() public view returns (bool) {
        return block.timestamp >= nextAt && pot >= minPot && pot > 0;
    }

    function clockIn() external {
        if (restricted && msg.sender != owner) revert NotAuthorized();
        if (block.timestamp < nextAt) revert NotReady(nextAt);
        if (pot == 0 || pot < minPot) revert EmptyPot();

        uint256 tip = clockInTip();
        uint256 rest = pot - tip;
        pot = 0;
        nextAt = block.timestamp + period;
        presses += 1;

        emit ClockIn(msg.sender, rest, tip);
        (bool ok,) = msg.sender.call{value: tip}("");
        require(ok, "tip failed");
    }
}
