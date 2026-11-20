// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice ERC-5192: minimal soulbound NFTs.
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    function locked(uint256 tokenId) external view returns (bool);
}

/**
 * @title OpenSignetPass
 * @author OpenSignet
 * @notice The OpenSignet Pass: one non-transferable token per OpenSignet identity, held in the
 *         account's OpenSignet wallet. It links the identity's domain with its Basename and ENS
 *         name, and nothing else.
 * @dev    Only OpenSignet's minter mints, links and burns. A pass never moves between wallets
 *         (ERC-5192, always locked): the identity belongs to the account, so a pass can't be
 *         sold apart from it. When a domain leaves OpenSignet (an account deleted for good, a
 *         domain transferred out or expired), the minter burns its pass. The owner (a multisig)
 *         sets minters and the metadata address, with two-step ownership transfer.
 */
contract OpenSignetPass is ERC721, Ownable2Step, IERC5192 {
    using Strings for uint256;

    struct Pass {
        string domain;
        string basename;
        string ensName;
        uint64 mintedAt;
    }

    /// @dev Next token ID (starts at 1, so 0 always means "no pass").
    uint256 private _nextTokenId = 1;
    /// @dev Passes in existence.
    uint256 private _live;
    mapping(uint256 tokenId => Pass) private _passes;
    mapping(bytes32 domainHash => uint256 tokenId) private _byDomain;

    /// @notice Addresses allowed to mint, link and burn (OpenSignet's backend signer).
    mapping(address minter => bool allowed) public minters;

    /// @notice Where token metadata is served; tokenURI is this followed by the token ID.
    string public baseURI;

    error NotMinter();
    error ZeroAddress();
    error EmptyDomain();
    error DomainHasPass(string domain, uint256 tokenId);
    error NoSuchPass(uint256 tokenId);
    error Soulbound();

    event MinterSet(address indexed minter, bool allowed);
    event BaseURISet(string baseURI);
    event PassMinted(uint256 indexed tokenId, address indexed holder, string domain);
    event PassLinked(uint256 indexed tokenId, string basename, string ensName);
    event PassBurned(uint256 indexed tokenId, string domain);
    /// @dev ERC-4906: tells marketplaces to refresh a pass's metadata.
    event MetadataUpdate(uint256 tokenId);
    event BatchMetadataUpdate(uint256 fromTokenId, uint256 toTokenId);

    modifier onlyMinter() {
        if (!minters[msg.sender]) revert NotMinter();
        _;
    }

    constructor(address initialOwner, string memory initialBaseURI)
        ERC721("OpenSignet Pass", "OSPASS")
        Ownable(initialOwner)
    {
        baseURI = initialBaseURI;
        emit BaseURISet(initialBaseURI);
    }

    // ------------------------------------------------------------------
    //                              Owner
    // ------------------------------------------------------------------

    function setMinter(address minter, bool allowed) external onlyOwner {
        if (minter == address(0)) revert ZeroAddress();
        minters[minter] = allowed;
        emit MinterSet(minter, allowed);
    }

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        baseURI = newBaseURI;
        emit BaseURISet(newBaseURI);
        if (_nextTokenId > 1) emit BatchMetadataUpdate(1, _nextTokenId - 1);
    }

    // ------------------------------------------------------------------
    //                              Minter
    // ------------------------------------------------------------------

    /**
     * @notice Mints the pass of `domain` into `holder` (the account's OpenSignet wallet).
     * @dev    One pass per domain at a time; a burned domain can get a new pass later.
     */
    function mint(
        address holder,
        string calldata domain,
        string calldata basename,
        string calldata ensName
    ) external onlyMinter returns (uint256 tokenId) {
        if (holder == address(0)) revert ZeroAddress();
        if (bytes(domain).length == 0) revert EmptyDomain();
        bytes32 key = keccak256(bytes(domain));
        uint256 existing = _byDomain[key];
        if (existing != 0) revert DomainHasPass(domain, existing);

        tokenId = _nextTokenId++;
        _live += 1;
        _passes[tokenId] = Pass({
            domain: domain, basename: basename, ensName: ensName, mintedAt: uint64(block.timestamp)
        });
        _byDomain[key] = tokenId;
        _safeMint(holder, tokenId);
        emit Locked(tokenId);
        emit PassMinted(tokenId, holder, domain);
        if (bytes(basename).length != 0 || bytes(ensName).length != 0) {
            emit PassLinked(tokenId, basename, ensName);
        }
    }

    /// @notice Links (or clears, with empty strings) the Basename and ENS name of a pass.
    function link(uint256 tokenId, string calldata basename, string calldata ensName)
        external
        onlyMinter
    {
        Pass storage pass = _existing(tokenId);
        pass.basename = basename;
        pass.ensName = ensName;
        emit PassLinked(tokenId, basename, ensName);
        emit MetadataUpdate(tokenId);
    }

    /// @notice Burns the pass when its domain leaves OpenSignet.
    function burn(uint256 tokenId) external onlyMinter {
        string memory domain = _existing(tokenId).domain;
        delete _byDomain[keccak256(bytes(domain))];
        delete _passes[tokenId];
        _live -= 1;
        _burn(tokenId);
        emit PassBurned(tokenId, domain);
    }

    // ------------------------------------------------------------------
    //                              Views
    // ------------------------------------------------------------------

    function passOf(uint256 tokenId) external view returns (Pass memory) {
        return _existing(tokenId);
    }

    /// @notice The token ID of the domain's pass, or 0 when it has none.
    function passIdOfDomain(string calldata domain) external view returns (uint256) {
        return _byDomain[keccak256(bytes(domain))];
    }

    function totalSupply() external view returns (uint256) {
        return _live;
    }

    /// @inheritdoc IERC5192
    function locked(uint256 tokenId) external view returns (bool) {
        _existing(tokenId);
        return true;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _existing(tokenId);
        return string.concat(baseURI, tokenId.toString());
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || interfaceId == bytes4(0x49064906)
            || super.supportsInterface(interfaceId);
    }

    // ------------------------------------------------------------------
    //                          Soulbound rules
    // ------------------------------------------------------------------

    /// @dev Passes are only minted and burned, never moved.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address from)
    {
        from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    /// @dev Nothing to approve: a pass can't be transferred.
    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    function _existing(uint256 tokenId) private view returns (Pass storage pass) {
        if (_ownerOf(tokenId) == address(0)) revert NoSuchPass(tokenId);
        return _passes[tokenId];
    }
}
