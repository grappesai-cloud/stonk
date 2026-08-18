// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// ERC-721 minim, cat sa tina loc de colectia StonkBrokers in teste.
contract MockBrokerNFT {
    string public name = "Mock StonkBrokers";
    string public symbol = "MBROKER";

    uint256 public totalSupply;
    mapping(uint256 => address) internal _owners;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);

    function ownerOf(uint256 tokenId) public view returns (address o) {
        o = _owners[tokenId];
        require(o != address(0), "no token");
    }

    function tokenByIndex(uint256 i) external view returns (uint256) {
        require(i < totalSupply, "oob");
        return i + 1;
    }

    function mint(address to, uint256 count) external {
        for (uint256 i = 0; i < count; i++) {
            uint256 id = ++totalSupply;
            _owners[id] = to;
            balanceOf[to]++;
            emit Transfer(address(0), to, id);
        }
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(ownerOf(tokenId) == from, "wrong from");
        require(
            msg.sender == from || isApprovedForAll[from][msg.sender] || getApproved[tokenId] == msg.sender,
            "not allowed"
        );
        _owners[tokenId] = to;
        balanceOf[from]--;
        balanceOf[to]++;
        delete getApproved[tokenId];
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        transferFrom(from, to, tokenId);
    }

    function approve(address to, uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "not owner");
        getApproved[tokenId] = to;
        emit Approval(msg.sender, to, tokenId);
    }

    function setApprovalForAll(address op, bool ok) external {
        isApprovedForAll[msg.sender][op] = ok;
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x80ac58cd || id == 0x01ffc9a7 || id == 0x780e9d63;
    }
}
