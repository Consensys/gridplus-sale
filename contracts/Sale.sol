// Token sale contract
pragma solidity ^0.4.11;
import "./ERC20Plus.sol";

contract Sale {

  address private admin;
  address public GRID;
  mapping (address => uint) wei_sent;      // Amounts of wei sent
  mapping (address => bool) presale;       // Whitelisted presale participants
  uint public start;                       // Starting block
  uint public end;                         // Ending block
  uint public cap;                         // Cap on the total wei to raise
  uint public Rmax;                        // Maximum reward (qGRID/WEI), multiple of 5
  uint public Rf;                          // Final reward (qGRID/WEI)
  bool private hatch_open;                 // Escape hatch

  uint public m_denom;                     // denominator of slope (should be 50,000)
  uint public y_int_denom;                 // denominator of y-intercept (should be 5)

  //============================================================================
  // PUBLIC SALE
  //============================================================================

  // The token sale
  function() payable {
    if (block.number < start && presale[msg.sender] == true) {
      // For whitelisted pre-sale participants
      wei_sent[msg.sender] = safeAdd(wei_sent[msg.sender], msg.value);
    } else if (
      block.number >= start && block.number <= end
      && msg.value + address(this).balance <= cap
    ) {
      wei_sent[msg.sender] = safeAdd(wei_sent[msg.sender], msg.value);
      // Update the price
      uint r = CalcReward();
      if (r > Rmax) { r = Rmax; }
      Rf = r;
    } else { throw; }
  }

  // Once the auction is over, contributors may withdraw their tokens.
  // Anyone may distribute tokens to any participant.
  function Withdraw(address user) {
    if (wei_sent[user] == 0) { throw; }
    else if (address(this).balance < cap && end > block.number) { throw; }
    else {
      uint amt = GetUserReward(user);

      // Instantiate the grid token and transfer
      ERC20Plus grid = ERC20Plus(GRID);
      if (!grid.transfer(user, amt)) { throw; }
    }
  }


  // Once the sale has started, calculate the price
  // Price is in GRID/wei
  // Where qGRID is the atomic unit of GRID (1 GRID = 10*18 qGRID)
  function CalcReward() private returns (uint) {
    if (block.number < start || block.number > end) { throw; }
    else {
      //R = (Rmax/5)  + (Rmax * (Bi - B0))/50,000
      uint y_int = safeDiv(Rmax, y_int_denom);

      uint d_block = safeSub(block.number, start);
      // 0.0005 eth == 50000000000000 wei
      uint _m = safeMul(Rmax, d_block);
      uint m = safeDiv(_m, m_denom);
      return safeAdd(y_int, m);
    }
  }

  //============================================================================
  // PRE-SALE
  //============================================================================

  // Whitelist an address to participate in the presale
  function WhitelistPresale(address user) onlyAdmin() {
    presale[user] = true;
  }

  // If we want to kick a presaler out for some reason
  function VentPresale(address user) onlyAdmin() {
    if (start > block.number) { throw; }
    else {
      uint amount = wei_sent[user];
      wei_sent[user] = 0;
      user.call.gas(21000).value(amount);
      presale[user] = false;
    }
  }

  //============================================================================
  // SAFE MATH
  //============================================================================

  function safeAdd(uint256 a, uint256 b) internal returns (uint256) {
    uint256 c = a + b;
    assert(c >= a);
    return c;
  }

  function safeSub(uint256 a, uint256 b) internal returns (uint256) {
    assert(b <= a);
    return a - b;
  }

  function safeMul(uint256 a, uint256 b) internal returns (uint256) {
    uint256 c = a * b;
    assert(a == 0 || c / a == b);
    return c;
  }

  function safeDiv(uint256 a, uint256 b) internal returns (uint256) {
    // assert(b > 0); // Solidity automatically throws when dividing by 0
    uint256 c = a / b;
    // assert(a == b * c + a % b); // There is no case in which this doesn't hold
    return c;
  }


  modifier onlyAdmin() {
    if (msg.sender != admin) { throw; }
    _;
  }


  //============================================================================
  // ADMIN
  //============================================================================

  // Instantiate the Auction contract with GRID and BOLT addresses.
  function Sale(address _GRID) {
    admin = msg.sender;
    GRID = _GRID;
    hatch_open = false;
  }

  // Parameterize the sale
  function SetupSale(uint _Rmax, uint _cap, uint _start, uint length, uint _y_den, uint _m_den) onlyAdmin() {
    // Can only do this once
    if (start == 0) {
      y_int_denom = _y_den;
      m_denom = _m_den;
      cap = _cap;
      Rmax = _Rmax;  // This needs to be a multiple of 5
      start = _start;
      end = length + _start;
    } else {
      throw;
    }
  }

  function MoveFunds(address to, uint amount) onlyAdmin() {
    to.call.gas(21000).value(amount);
  }

  function SwitchAdmin(address new_admin) onlyAdmin() {
    admin = new_admin;
  }

  //============================================================================
  // GETTERS
  //============================================================================

  // Get how much wei a user contributed
  function Contribution(address user) public constant returns (uint) {
    return wei_sent[user];
  }

  // Determine how many GRID will be rewarded.
  function Reward(address user) public constant returns (uint) {
    uint amt = GetUserReward(user);
    return amt;
  }

  function GetUserReward(address user) returns (uint) {
    // Calculate the amount of GRID to send the contributor
    uint contribution = wei_sent[user];
    wei_sent[user] = 0;

    // Make sure we don't go over the max reward
    uint max_reward = Rmax*contribution;

    if (presale[user] == true) {
      // Presalers get up to 15% more tokens
      uint _amt = safeMul(safeMul(contribution, Rf), uint(115));
      uint amt = safeDiv(_amt, uint(100));
      if (amt > max_reward) { return max_reward; }
      else { return amt; }

    } else {
      // Normal partipants get the contribution times Rf
      return safeMul(contribution, Rf);
    }
  }

  //============================================================================
  // EMERGENCY
  //============================================================================

  // Open or close the escape hatch
  function Escape(bool open) onlyAdmin() {
    hatch_open = open;
  }

  // User may withdraw ether sent to the contract at any time if the hatch is open.
  function Abort(address user) {
    if (hatch_open == false) { throw; }
    else {
      uint to_refund = wei_sent[user];
      wei_sent[user] = 0;
      user.call.gas(21000).value(to_refund);
    }
  }


}
