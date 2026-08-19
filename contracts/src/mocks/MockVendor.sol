// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Min {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * Masinile care se golesc, ca sa avem pe ce proba Stocker-ul.
 *
 * Are amandoua felurile de plata, fiindca ele schimba complet ce trebuie sa
 * verifice agentul inainte sa apese:
 *  - plata in ETH: banii pleaca ODATA cu apelul, deci trebuie sa fie in
 *    portofel in momentul semnarii
 *  - plata in jetoane: contractul TRAGE din portofel prin allowance, deci
 *    limita reala nu e cat ai, ci cat ai aprobat
 *
 * `restock` e libera: oricine aduce marfa isi ia comisionul. Asa si trebuie sa
 * fie, altfel agentul nu are ce cauta aici.
 */
contract MockVendor {
    error NotAuthorized();
    error NoRoom(uint256 id);
    error WrongPayment(uint256 want, uint256 got);

    event Restocked(uint256 indexed id, address indexed by, uint256 units, uint256 commission);
    event Sold(uint256 indexed id, uint256 units);

    struct Machine {
        uint8 status;
        uint256 stock;
        uint256 capacity;
        uint256 price; // cat platim pe unitate
        uint256 commission; // cat incasam pe unitate
    }

    address public owner;
    address public token; // 0 = plata in ETH
    uint256 public nextMachineId = 1;
    mapping(uint256 => Machine) internal machines;
    uint256[] internal ids;
    bool public restricted;

    constructor(address _token) {
        owner = msg.sender;
        token = _token;
    }

    receive() external payable {}

    function open(uint256 capacity, uint256 stock, uint256 price, uint256 commission) external returns (uint256 id) {
        id = nextMachineId++;
        machines[id] = Machine({status: 1, stock: stock, capacity: capacity, price: price, commission: commission});
        ids.push(id);
    }

    function setRestricted(bool v) external {
        if (msg.sender != owner) revert NotAuthorized();
        restricted = v;
    }

    /** goleste o masina, ca sa avem ce umple */
    function sell(uint256 id, uint256 units) external {
        Machine storage m = machines[id];
        m.stock = units > m.stock ? 0 : m.stock - units;
        emit Sold(id, units);
    }

    function restock(uint256 id, uint256 units) external payable {
        if (restricted && msg.sender != owner) revert NotAuthorized();
        Machine storage m = machines[id];
        if (m.stock + units > m.capacity) revert NoRoom(id);

        uint256 due = m.price * units;
        if (token == address(0)) {
            if (msg.value != due) revert WrongPayment(due, msg.value);
        } else {
            if (msg.value != 0) revert WrongPayment(0, msg.value);
            IERC20Min(token).transferFrom(msg.sender, address(this), due);
        }

        m.stock += units;
        uint256 pay = m.commission * units;
        emit Restocked(id, msg.sender, units, pay);
        (bool ok,) = msg.sender.call{value: pay}("");
        require(ok, "commission failed");
    }

    function machineOf(uint256 id)
        external
        view
        returns (uint8 status, uint256 stock, uint256 capacity, uint256 price, uint256 commission)
    {
        Machine storage m = machines[id];
        return (m.status, m.stock, m.capacity, m.price, m.commission);
    }

    function machines_() external view returns (uint256[] memory) {
        return ids;
    }
}
