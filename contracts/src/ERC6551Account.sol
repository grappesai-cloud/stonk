// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC721Min {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * Implementarea minima de cont legat de token (TBA).
 * Poate primi ETH si tokeni, si executa apeluri doar daca cere proprietarul
 * NFT-ului. Courier-ul NU trece prin ea: livrarile se cheama direct pe
 * contractul de drop-uri, iar contul e doar destinatia.
 */
contract ERC6551Account {
    uint256 public state;

    receive() external payable {}

    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        returns (bytes memory result)
    {
        require(msg.sender == owner(), "not owner");
        require(operation == 0, "only call");
        ++state;
        bool ok;
        (ok, result) = to.call{value: value}(data);
        if (!ok) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    /// (chainId, tokenContract, tokenId) citite din coada propriului bytecode
    function token() public view returns (uint256 chainId, address tokenContract, uint256 tokenId) {
        bytes memory footer = new bytes(0x60);
        assembly {
            extcodecopy(address(), add(footer, 0x20), 0x4d, 0x60)
        }
        return abi.decode(footer, (uint256, address, uint256));
    }

    function owner() public view returns (address) {
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        if (chainId != block.chainid) return address(0);
        return IERC721Min(tokenContract).ownerOf(tokenId);
    }

    function isValidSigner(address signer, bytes calldata) external view returns (bytes4) {
        return signer == owner() ? bytes4(0x523e3260) : bytes4(0);
    }

    function supportsInterface(bytes4) external pure returns (bool) {
        return true;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
