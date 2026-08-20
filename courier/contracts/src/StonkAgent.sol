// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * StonkAgent - NFT-ul agentului.
 *
 * Trei decizii de proiect scrise in cod, nu in prezentare:
 *
 * 1. UN SINGUR TIP DE AGENT, cu slot de rol. Nu cinci clase. Daca vinzi cinci
 *    clase si exista o singura unealta care merge, patru cincimi din colectie
 *    e marfa moarta din prima zi, iar aia se vede imediat. Rolul se instaleaza
 *    si se poate schimba cand apare o unealta noua.
 *
 * 2. CONTRACTUL NU PROMITE NICIUN RANDAMENT. Nu tine bani, nu imparte castiguri,
 *    nu are functie de revendicare. Ce castiga agentul ajunge direct in
 *    portofelul lui 6551. Un contract care promite venit din munca altcuiva e
 *    exact forma pe care nu vrei sa o ai.
 *
 * 3. MINTUL ARDE. Jumatate din pret pleaca la adresa moarta, jumatate la
 *    trezorerie. Amandoua procentele sunt vizibile si nu se pot schimba dupa
 *    desfasurare.
 *
 * Portofelul fiecarui agent e un cont ERC-6551 la registrul canonic. Nu ne
 * scriem propria implementare: mai putin cod care atinge bani inseamna mai
 * putin de auditat.
 */

interface IERC20Min {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IERC6551Registry {
    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address);

    function account(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external view returns (address);
}

contract StonkAgent {
    // ------------------------------------------------------------- metadate
    string public name = "Stonk Agents";
    string public symbol = "AGENT";
    string public baseURI;

    // ------------------------------------------------------------ imutabile
    /// jetonul ars la mint
    IERC20Min public immutable payToken;
    /// pretul unui agent, in jetoane
    uint256 public immutable price;
    /// cat din pret se arde, in puncte de baza (5000 = 50%)
    uint16 public immutable burnBps;
    /// cati agenti pot exista vreodata
    uint256 public immutable maxSupply;
    /// cati poate scoate casa fara plata (prototipuri, premii)
    uint256 public immutable reserveCap;

    IERC6551Registry public immutable registry;
    address public immutable accountImplementation;
    bytes32 public immutable accountSalt;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // -------------------------------------------------------------- variabile
    address public owner;
    address public treasury;
    bool public mintOpen;
    uint256 public totalSupply;
    uint256 public reserveMinted;

    /// rolul instalat pe fiecare agent; 0 inseamna niciunul
    mapping(uint256 => uint8) public roleOf;
    /// rolurile care exista si se pot instala
    mapping(uint8 => string) public roleName;
    uint8 public roleCount;

    /// se schimba la fiecare transfer; un cumparator poate verifica in aceeasi
    /// tranzactie ca nu i s-a schimbat marfa sub mana
    mapping(uint256 => uint64) public stateNonce;

    mapping(uint256 => address) internal _owners;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    // ---------------------------------------------------------------- erori
    error NotOwner();
    error MintClosed();
    error SoldOut();
    error ReserveExhausted();
    error NoToken();
    error NotAllowed();
    error BadRole();
    error BadRecipient();
    error PaymentFailed();
    error BadConfig();

    // -------------------------------------------------------------- evenimente
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event Minted(address indexed to, uint256 indexed tokenId, uint256 burned, uint256 toTreasury);
    event RoleInstalled(uint256 indexed tokenId, uint8 indexed role, string name);
    event RoleDefined(uint8 indexed role, string name);
    event MintOpened(bool open);
    event OwnerChanged(address indexed from, address indexed to);
    event TreasuryChanged(address indexed to);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        address _payToken,
        uint256 _price,
        uint16 _burnBps,
        uint256 _maxSupply,
        uint256 _reserveCap,
        address _treasury,
        address _registry,
        address _accountImplementation,
        bytes32 _accountSalt,
        string memory _baseURI
    ) {
        if (_burnBps > 10_000 || _maxSupply == 0 || _reserveCap > _maxSupply) revert BadConfig();
        if (_treasury == address(0) || _registry == address(0)) revert BadConfig();

        payToken = IERC20Min(_payToken);
        price = _price;
        burnBps = _burnBps;
        maxSupply = _maxSupply;
        reserveCap = _reserveCap;
        treasury = _treasury;
        registry = IERC6551Registry(_registry);
        accountImplementation = _accountImplementation;
        accountSalt = _accountSalt;
        baseURI = _baseURI;
        owner = msg.sender;
    }

    // ------------------------------------------------------------------ mint
    /**
     * Mintul cere jetoane, nu ETH. Jumatate ard, restul merg la trezorerie.
     * Contractul nu retine niciodata nimic pentru el.
     */
    function mint(uint256 count) external returns (uint256 firstId) {
        if (!mintOpen) revert MintClosed();
        if (count == 0) revert BadConfig();
        if (totalSupply + count > maxSupply - (reserveCap - reserveMinted)) revert SoldOut();

        uint256 total = price * count;
        uint256 burned = (total * burnBps) / 10_000;
        uint256 rest = total - burned;

        if (burned > 0 && !payToken.transferFrom(msg.sender, DEAD, burned)) revert PaymentFailed();
        if (rest > 0 && !payToken.transferFrom(msg.sender, treasury, rest)) revert PaymentFailed();

        firstId = totalSupply + 1;
        for (uint256 i = 0; i < count; i++) {
            _mint(msg.sender, totalSupply + 1);
        }
        emit Minted(msg.sender, firstId, burned, rest);
    }

    /// prototipuri si premii; nu poate depasi rezerva anuntata
    function mintReserved(address to, uint256 count) external onlyOwner {
        if (to == address(0)) revert BadRecipient();
        if (reserveMinted + count > reserveCap) revert ReserveExhausted();
        if (totalSupply + count > maxSupply) revert SoldOut();
        reserveMinted += count;
        for (uint256 i = 0; i < count; i++) {
            _mint(to, totalSupply + 1);
        }
    }

    function _mint(address to, uint256 tokenId) internal {
        totalSupply = tokenId;
        _owners[tokenId] = to;
        balanceOf[to]++;
        emit Transfer(address(0), to, tokenId);
    }

    // ------------------------------------------------------------------ rol
    function defineRole(uint8 role, string calldata label) external onlyOwner {
        if (role == 0) revert BadRole();
        if (bytes(roleName[role]).length == 0) roleCount++;
        roleName[role] = label;
        emit RoleDefined(role, label);
    }

    /**
     * Instalarea rolului. Se poate schimba oricand: cand apare o unealta noua,
     * agentii existenti pot trece pe ea in loc sa devina inutili.
     */
    function installRole(uint256 tokenId, uint8 role) external {
        if (ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (role != 0 && bytes(roleName[role]).length == 0) revert BadRole();
        roleOf[tokenId] = role;
        emit RoleInstalled(tokenId, role, roleName[role]);
    }

    // -------------------------------------------------------------- portofel
    /// portofelul 6551 al agentului, calculat, fara sa fie desfasurat
    function walletOf(uint256 tokenId) public view returns (address) {
        return registry.account(accountImplementation, accountSalt, block.chainid, address(this), tokenId);
    }

    /// il desfasoara efectiv; oricine poate, e doar gaz
    function createWallet(uint256 tokenId) external returns (address) {
        ownerOf(tokenId); // trebuie sa existe
        return registry.createAccount(accountImplementation, accountSalt, block.chainid, address(this), tokenId);
    }

    /**
     * Fotografia agentului, pentru cine cumpara.
     *
     * Un NFT cu portofel poate fi golit de vanzator chiar in blocul in care se
     * face vanzarea. Nimic on-chain nu opreste asta. Ce se poate face, si se
     * face aici, e sa dai cumparatorului cu ce sa verifice ATOMIC, in aceeasi
     * tranzactie: soldul si un contor care se schimba la fiecare transfer.
     * Cumpararea in siguranta trece printr-un contract care compara valorile
     * astea cu cele asteptate si da revert daca nu se potrivesc.
     */
    function snapshot(uint256 tokenId)
        external
        view
        returns (address tokenOwner, address wallet, uint256 walletBalance, uint8 role, uint64 nonce)
    {
        tokenOwner = ownerOf(tokenId);
        wallet = walletOf(tokenId);
        walletBalance = wallet.balance;
        role = roleOf[tokenId];
        nonce = stateNonce[tokenId];
    }

    // ------------------------------------------------------------- ERC-721
    function ownerOf(uint256 tokenId) public view returns (address o) {
        o = _owners[tokenId];
        if (o == address(0)) revert NoToken();
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);
        return string.concat(baseURI, _toString(tokenId));
    }

    function approve(address to, uint256 tokenId) external {
        address o = ownerOf(tokenId);
        if (msg.sender != o && !isApprovedForAll[o][msg.sender]) revert NotAllowed();
        getApproved[tokenId] = to;
        emit Approval(o, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        if (ownerOf(tokenId) != from) revert NotOwner();
        if (to == address(0)) revert BadRecipient();
        if (msg.sender != from && !isApprovedForAll[from][msg.sender] && getApproved[tokenId] != msg.sender) {
            revert NotAllowed();
        }
        delete getApproved[tokenId];
        _owners[tokenId] = to;
        balanceOf[from]--;
        balanceOf[to]++;
        /* contorul se misca la fiecare schimbare de proprietar: cine cumpara
           poate cere in aceeasi tranzactie ca marfa sa fie cea vazuta */
        unchecked {
            stateNonce[tokenId]++;
        }
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length > 0) {
            bytes4 got = IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data);
            if (got != IERC721Receiver.onERC721Received.selector) revert BadRecipient();
        }
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f;
    }

    // ------------------------------------------------------------ administrare
    function setMintOpen(bool open) external onlyOwner {
        mintOpen = open;
        emit MintOpened(open);
    }

    function setTreasury(address to) external onlyOwner {
        if (to == address(0)) revert BadRecipient();
        treasury = to;
        emit TreasuryChanged(to);
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        baseURI = uri;
    }

    function transferOwnership(address to) external onlyOwner {
        if (to == address(0)) revert BadRecipient();
        emit OwnerChanged(owner, to);
        owner = to;
    }

    // ------------------------------------------------------------------ util
    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 len;
        for (uint256 t = v; t != 0; t /= 10) len++;
        bytes memory buf = new bytes(len);
        while (v != 0) {
            buf[--len] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(buf);
    }
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}
