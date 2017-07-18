pragma solidity ^0.4.8;

import "./ERC20.sol";

contract GRID is ERC20 {
  mapping(address => mapping(bytes32 => bool)) played;
  mapping(address => uint) nonces;

  //============================================================================
  // ERC20
  //============================================================================

  mapping( address => uint ) balances;
  mapping( address => mapping( address => uint ) ) approvals;
  uint public supply;
  string public name;
  uint8 public decimals;
  string public symbol;
  string public version;

  function GRID( uint _supply, string _name, uint8 _decimals, string _symbol, string _version ) {
    balances[msg.sender] = _supply;
    supply = _supply;
    name = _name;
    decimals = _decimals;
    symbol = _symbol;
    version = _version;
  }

  function totalSupply() constant returns (uint) {
    return supply;
  }

  function balanceOf( address who ) constant returns (uint) {
    return balances[who];
  }

  function transfer( address to, uint value) returns (bool) {
    balances[msg.sender] = safeSub(balances[msg.sender], value);
    balances[to] = safeAdd(balances[to], value);
    Transfer( msg.sender, to, value );
    return true;
  }

  function transferFrom( address from, address to, uint value) returns (bool) {
    approvals[from][msg.sender] = safeSub(approvals[from][msg.sender], value);
    balances[from] = safeSub(balances[from], value);
    balances[to] = safeAdd(balances[to], value);
    Transfer( from, to, value );
    return true;
  }

  function approve(address spender, uint value) returns (bool) {
    approvals[msg.sender][spender] = value;
    Approval( msg.sender, spender, value );
    return true;
  }

  function allowance(address owner, address spender) constant returns (uint) {
    return approvals[owner][spender];
  }

  //============================================================================
  // PROVABLE FUNCTIONS
  //============================================================================

  // sig[1]    r of signature
  // sig[2]    s of signature
  // sig[3]    v of signature
  function provable_redemption(bytes32[3] sig, uint256 value) returns (bool) {
   // ABI definition of this function
    bytes32 word = 0x5ac232f4;
    uint nonce = nonces[signer];
    //bytes32 _msg = sha3(sha3(uint(value)), bytes4(word), address(this), uint(nonce));
    bytes32 _msg = sha3(sha3(uint(value)), address(this), word, uint(nonce));
    bytes memory prefix = "\x19Ethereum Signed Message:\n32";
    bytes32 msg = sha3(prefix, _msg);
    address signer = ecrecover(msg, uint8(sig[2]), sig[0], sig[1]);

    // Replay protection
    //if (played[signer][msg] == true) { return false; }

    // Update state variables
    played[signer][_msg] = true;
    nonces[signer] += 1;

    // Redeem
    balances[signer] = safeSub(balances[signer], value);
    supply = safeSub(supply, value);
    Transfer(signer, 0, value);

    return true;
  }

  function get_nonce(address user) public constant returns (uint) {
    return nonces[user];
  }

  //============================================================================
  // SAFE MATH FUNCTIONS
  //============================================================================

  function safeToAdd(uint a, uint b) internal returns (bool) {
    return (a + b >= a);
  }

  function safeAdd(uint a, uint b) internal returns (uint) {
    if (!safeToAdd(a, b)) throw;
    return a + b;
  }

  function safeToSubtract(uint a, uint b) internal returns (bool) {
    return (b <= a);
  }

  function safeSub(uint a, uint b) internal returns (uint) {
    if (!safeToSubtract(a, b)) throw;
    return a - b;
  }

  function() { throw; }
}
