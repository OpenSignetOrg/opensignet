// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {OpenSignetPass, IERC5192} from "../src/OpenSignetPass.sol";

/// @dev Foundry's cheatcodes, called at their fixed address (no test library needed).
interface Vm {
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata data) external;
    function expectEmit(bool topic1, bool topic2, bool topic3, bool data, address emitter) external;
}

/// @dev Minimal assertions with readable failures.
abstract contract Checks {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    function makeAddr(string memory label) internal pure returns (address) {
        return address(uint160(uint256(keccak256(bytes(label)))));
    }

    function assertTrue(bool condition) internal pure {
        require(condition, "expected true");
    }

    function assertEq(uint256 a, uint256 b) internal pure {
        require(a == b, "numbers differ");
    }

    function assertEq(address a, address b) internal pure {
        require(a == b, "addresses differ");
    }

    function assertEq(string memory a, string memory b) internal pure {
        require(keccak256(bytes(a)) == keccak256(bytes(b)), string.concat(a, " != ", b));
    }
}

contract OpenSignetPassTest is Checks {
    OpenSignetPass internal pass;
    address internal owner = makeAddr("owner");
    address internal minter = makeAddr("minter");
    address internal wallet = makeAddr("embedded wallet");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        pass = new OpenSignetPass(owner, "https://opensignet.com/pass/");
        vm.prank(owner);
        pass.setMinter(minter, true);
    }

    function _mint(string memory domain) internal returns (uint256) {
        vm.prank(minter);
        return pass.mint(wallet, domain, "", "");
    }

    function test_mintsIntoTheWallet_withTheDomainAndLinks() public {
        vm.prank(minter);
        uint256 id = pass.mint(wallet, "northwind.ai", "northwind.base.eth", "northwind.eth");
        assertEq(id, 1);
        assertEq(pass.ownerOf(id), wallet);
        OpenSignetPass.Pass memory record = pass.passOf(id);
        assertEq(record.domain, "northwind.ai");
        assertEq(record.basename, "northwind.base.eth");
        assertEq(record.ensName, "northwind.eth");
        assertEq(pass.passIdOfDomain("northwind.ai"), id);
        assertEq(pass.totalSupply(), 1);
        assertEq(pass.tokenURI(id), "https://opensignet.com/pass/1");
        assertEq(pass.name(), "OpenSignet Pass");
        assertEq(pass.symbol(), "OSPASS");
    }

    function test_onlyMintersMintLinkAndBurn() public {
        vm.prank(stranger);
        vm.expectRevert(OpenSignetPass.NotMinter.selector);
        pass.mint(stranger, "x.com", "", "");
        uint256 id = _mint("x.com");
        vm.startPrank(stranger);
        vm.expectRevert(OpenSignetPass.NotMinter.selector);
        pass.link(id, "x.base.eth", "");
        vm.expectRevert(OpenSignetPass.NotMinter.selector);
        pass.burn(id);
        vm.stopPrank();
    }

    function test_oneLivePassPerDomain() public {
        uint256 id = _mint("hello.com");
        vm.prank(minter);
        vm.expectRevert(
            abi.encodeWithSelector(OpenSignetPass.DomainHasPass.selector, "hello.com", id)
        );
        pass.mint(stranger, "hello.com", "", "");
    }

    function test_neverMoves() public {
        uint256 id = _mint("bound.com");
        vm.startPrank(wallet);
        vm.expectRevert(OpenSignetPass.Soulbound.selector);
        pass.transferFrom(wallet, stranger, id);
        vm.expectRevert(OpenSignetPass.Soulbound.selector);
        pass.safeTransferFrom(wallet, stranger, id);
        vm.expectRevert(OpenSignetPass.Soulbound.selector);
        pass.approve(stranger, id);
        vm.expectRevert(OpenSignetPass.Soulbound.selector);
        pass.setApprovalForAll(stranger, true);
        vm.stopPrank();
        assertTrue(pass.locked(id));
        assertEq(pass.ownerOf(id), wallet);
    }

    function test_announcesItIsLocked() public {
        vm.expectEmit(false, false, false, true, address(pass));
        emit IERC5192.Locked(1);
        _mint("locked.com");
        assertTrue(pass.supportsInterface(type(IERC5192).interfaceId));
        assertTrue(pass.supportsInterface(0x49064906)); // ERC-4906 metadata updates
        assertTrue(pass.supportsInterface(0x80ac58cd)); // ERC-721
    }

    function test_linksChangeLater() public {
        uint256 id = _mint("later.com");
        vm.prank(minter);
        pass.link(id, "later.base.eth", "later.eth");
        assertEq(pass.passOf(id).basename, "later.base.eth");
        assertEq(pass.passOf(id).ensName, "later.eth");
    }

    function test_burnReleasesTheDomain() public {
        uint256 id = _mint("gone.com");
        vm.prank(minter);
        pass.burn(id);
        assertEq(pass.passIdOfDomain("gone.com"), 0);
        assertEq(pass.totalSupply(), 0);
        vm.expectRevert(abi.encodeWithSelector(OpenSignetPass.NoSuchPass.selector, id));
        pass.passOf(id);
        uint256 again = _mint("gone.com");
        assertEq(again, id + 1);
    }

    function test_ownerControlsMintersAndMetadata_twoStep() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        pass.setMinter(stranger, true);
        vm.prank(owner);
        pass.setBaseURI("https://example.test/pass/");
        uint256 id = _mint("meta.com");
        assertEq(pass.tokenURI(id), "https://example.test/pass/1");
        vm.prank(owner);
        pass.transferOwnership(stranger);
        assertEq(pass.owner(), owner);
        vm.prank(stranger);
        pass.acceptOwnership();
        assertEq(pass.owner(), stranger);
    }

    function test_refusesEmptyAndZero() public {
        vm.startPrank(minter);
        vm.expectRevert(OpenSignetPass.EmptyDomain.selector);
        pass.mint(wallet, "", "", "");
        vm.expectRevert(OpenSignetPass.ZeroAddress.selector);
        pass.mint(address(0), "a.com", "", "");
        vm.stopPrank();
    }
}
