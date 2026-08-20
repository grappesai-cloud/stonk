// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRegistry {
    function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId)
        external
        view
        returns (address);
}

interface IERC20Min {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

interface IERC721Min2 {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * Distribuitorul de drop-uri, cat sa semene cu ce ar avea StonkBrokers.
 * Acumuleaza ETH si stock token per broker, iar `deliver` le impinge in
 * portofelul 6551 al brokerului si plateste un bacsis celui care a apelat.
 *
 * `ownerGated` e comutatorul care reproduce scenariul in care functia e
 * rezervata proprietarului. Exista ca sa putem dovedi ca unealta detecteaza
 * situatia din simulare, nu dupa ce arde gaz.
 */
contract MockDrops {
    IRegistry public immutable registry;
    address public immutable accountImpl;
    bytes32 public immutable salt;
    address public immutable brokers;
    address public immutable stockToken;

    uint16 public tipBps = 200; // 2% din portiunea de ETH
    uint256 public flatTipWei = 0.00002 ether; // bacsis fix pe livrare
    bool public ownerGated;

    mapping(uint256 => uint256) public pendingEthOf;
    mapping(uint256 => uint256) public pendingTokenOf;
    mapping(uint256 => uint256) public lastDeliveredAt;
    uint256 public deliveredCount;

    error NothingPending(uint256 tokenId);
    error NotBrokerOwner(uint256 tokenId);

    event Delivered(
        uint256 indexed tokenId,
        address indexed to,
        address indexed caller,
        uint256 ethAmount,
        uint256 tokenAmount,
        uint256 tip
    );

    constructor(address _registry, address _impl, bytes32 _salt, address _brokers, address _stock) {
        registry = IRegistry(_registry);
        accountImpl = _impl;
        salt = _salt;
        brokers = _brokers;
        stockToken = _stock;
    }

    function setGated(bool v) external {
        ownerGated = v;
    }

    function setTip(uint16 bps, uint256 flatWei) external {
        tipBps = bps;
        flatTipWei = flatWei;
    }

    /// destinatia unei livrari: portofelul 6551 al brokerului
    function walletOf(uint256 tokenId) public view returns (address) {
        return registry.account(accountImpl, salt, block.chainid, brokers, tokenId);
    }

    function pendingOf(uint256 tokenId) external view returns (uint256 ethAmount, uint256 tokenAmount) {
        return (pendingEthOf[tokenId], pendingTokenOf[tokenId]);
    }

    function fund(uint256[] calldata ids, uint256[] calldata eth, uint256[] calldata tok) external payable {
        uint256 sum;
        for (uint256 i = 0; i < ids.length; i++) {
            pendingEthOf[ids[i]] += eth[i];
            pendingTokenOf[ids[i]] += tok[i];
            sum += eth[i];
        }
        require(msg.value >= sum, "underfunded");
    }

    function deliver(uint256 tokenId) public returns (uint256 tip) {
        if (ownerGated && IERC721Min2(brokers).ownerOf(tokenId) != msg.sender) revert NotBrokerOwner(tokenId);

        uint256 e = pendingEthOf[tokenId];
        uint256 t = pendingTokenOf[tokenId];
        if (e == 0 && t == 0) revert NothingPending(tokenId);

        pendingEthOf[tokenId] = 0;
        pendingTokenOf[tokenId] = 0;
        lastDeliveredAt[tokenId] = block.timestamp;
        deliveredCount++;

        address to = walletOf(tokenId);

        tip = flatTipWei + (e * tipBps) / 10_000;
        if (tip > e) tip = e;
        uint256 send = e - tip;

        if (send > 0) {
            (bool ok,) = to.call{value: send}("");
            require(ok, "eth send failed");
        }
        if (t > 0) IERC20Min(stockToken).transfer(to, t);
        if (tip > 0) {
            (bool ok2,) = msg.sender.call{value: tip}("");
            require(ok2, "tip failed");
        }

        emit Delivered(tokenId, to, msg.sender, send, t, tip);
    }

    function deliverBatch(uint256[] calldata ids) external returns (uint256 tips) {
        for (uint256 i = 0; i < ids.length; i++) {
            tips += deliver(ids[i]);
        }
    }

    receive() external payable {}
}
