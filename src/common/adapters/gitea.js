import PjaxAdapter from './pjax';
import extStore from '../core.storage';
import { DICT, EVENT, STORE } from '../core.constants';
import { isValidTimeStamp, parseGitmodules } from '../util.misc';
import * as giteaDetect from './pageDetect/gitea';

const GH_CONTAINERS = '.full>.page-content';
const GH_HEADER = '.full>.main';
const GH_FOOTER = 'footer > .container';
const GH_MAX_HUGE_REPOS_SIZE = 50;
// gitea reserved user names: https://github.com/go-gitea/gitea/blob/release/v1.18/models/user/user.go#L580
const GT_RESERVED_USER_NAMES = [
  '.well-known',
  'admin',
  'api',
  'assets',
  'attachments',
  'avatar',
  'avatars',
  'captcha',
  'commits',
  'debug',
  'error',
  'explore',
  'favicon.ico',
  'ghost',
  'issues',
  'login',
  'manifest.json',
  'metrics',
  'milestones',
  'new',
  'notifications',
  'org',
  'pulls',
  'raw',
  'repo',
  'repo-avatars',
  'robots.txt',
  'search',
  'serviceworker.js',
  'ssh_info',
  'swagger.v1.json',
  'user',
  'v2',
];
const GH_RESERVED_REPO_NAMES = ['followers', 'following', 'repositories'];

class Gitea extends PjaxAdapter {
  constructor() {
    super();
  }

  detect = giteaDetect;

  // @override
  init($sidebar, repoView) {
    repoView && repoView.init();

    super.init($sidebar);

    // Fix #151 by detecting when page layout is updated.
    // In this case, split-diff page has a wider layout, so need to recompute margin.
    // Note that couldn't do this in response to URL change, since new DOM via pjax might not be ready.
    const diffModeObserver = new window.MutationObserver(mutations => {
      mutations.forEach(mutation => {
        // eslint-disable-next-line no-bitwise
        if (~mutation.oldValue.indexOf('split-diff') || ~mutation.target.className.indexOf('split-diff')) {
          return $(document).trigger(EVENT.LAYOUT_CHANGE);
        }
      });
    });

    diffModeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      attributeOldValue: true,
    });
  }

  whoami() {
    return DICT.GITEA;
  }

  // @override
  getCssClass() {
    return 'gitmaster-gitea-sidebar';
  }

  // @override
  async shouldLoadEntireTree(repo) {
    const isLoadingPr = (await extStore.get(STORE.PR)) && repo.pullNumber;
    if (isLoadingPr) {
      return true;
    }

    const isGlobalLazyLoad = await extStore.get(STORE.LAZYLOAD);
    if (isGlobalLazyLoad) {
      return false;
    }

    // Else, return true only if it isn't in a huge repo list, which we must lazy load
    const key = `${repo.username}/${repo.reponame}`;
    const hugeRepos = await extStore.get(STORE.HUGE_REPOS);
    if (hugeRepos[key] && isValidTimeStamp(hugeRepos[key])) {
      // Update the last load time of the repo
      hugeRepos[key] = new Date().getTime();
      await extStore.set(STORE.HUGE_REPOS, hugeRepos);
    }
    return !hugeRepos[key];
  }

  // @override
  getCreateTokenUrl() {
    return `${window.location.protocol}//${window.location.host}/user/settings/applications`;
  }

  // @override
  updateLayout(sidebarPinned, sidebarVisible, sidebarWidth, isSidebarLeft) {
    const $header = $(GH_HEADER);
    const $footer = $(GH_FOOTER);
    const $containers = $(GH_CONTAINERS);

    const shouldPushEverything = sidebarPinned && sidebarVisible;

    const direction = isSidebarLeft ? 'left' : 'right';

    if (shouldPushEverything) {
      $header.attr('style', `padding-${direction}: ${sidebarWidth}px !important`);
      $containers.attr('style', `padding-${direction}: ${sidebarWidth}px !important`);
      $footer.attr('style', `padding-${direction}: ${sidebarWidth}px !important`);
    } else {
      $header.removeAttr('style');
      $containers.removeAttr('style');
      $footer.removeAttr('style');
    }
  }

  async getRepoData(currentRepo, token, cb) {
    // (username)/(reponame)[/(type)][/(typeId)]
    // eslint-disable-next-line no-useless-escape
    const match = window.location.pathname.match(/([^\/]+)\/([^\/]+)(?:\/([^\/]+))?(?:\/([^\/]+))?/);

    const username = match[1];
    const reponame = match[2];
    const type = match[3];
    const typeId = match[4];

    const isPR = type === 'pulls';

    if (~GT_RESERVED_USER_NAMES.indexOf(username) || ~GH_RESERVED_REPO_NAMES.indexOf(reponame)) {
      return cb();
    }

    const branchFromSummary = $('.choose strong').text();

    const branch =
      // Use the commit ID when showing a particular commit
      (type === 'commit' && typeId) ||
      // Use 'master' when viewing repo's releases or tags
      ((type === 'releases' || type === 'tags') && 'master') ||
      // Get commit ID or branch name from the DOM
      branchFromSummary ||
      ($('.overall-summary .numbers-summary .commits a').attr('href') || '').replace(`/${username}/${reponame}/commits/`, '') ||
      // The above should work for tree|blob, but if DOM changes, fallback to use ID from URL
      ((type === 'tree' || type === 'blob') && typeId) ||
      // Use target branch in a PR page
      (isPR
        ? (
          $('.commit-ref')
            .not('.head-ref')
            .attr('title') || ':'
        ).match(/:(.*)/)[1]
        : null) ||
      // Reuse last selected branch if exist
      (currentRepo.username === username && currentRepo.reponame === reponame && currentRepo.branch) ||
      // Get default branch from cache
      this._defaultBranch[username + '/' + reponame];

    const showOnlyChangedInPR = await extStore.get(STORE.PR);
    const pullNumber = isPR && showOnlyChangedInPR ? typeId : null;
    const pullHead = isPR ? ($('.commit-ref.head-ref').attr('title') || ':').match(/:(.*)/)[1] : null;
    const displayBranch = isPR && pullHead ? `${branch} < ${pullHead}` : null;
    const repo = {
      username,
      reponame,
      branch,
      displayBranch,
      pullNumber,
    };
    if (repo.branch) {
      cb(null, repo);
    } else {
      // Still no luck, get default branch for real
      this._get(
        null,
        {
          repo,
          token,
        },
        (err, data) => {
          if (err) return cb(err);
          // eslint-disable-next-line no-multi-assign
          repo.branch = this._defaultBranch[username + '/' + reponame] = data.default_branch || 'master';
          cb(null, repo);
        }
      );
    }
  }

  async getRepoDataWrap(currentRepo, token) {
    if (!giteaDetect.shouldEnable()) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.getRepoData(currentRepo, token, (error, result) => {
        if (!error) {
          resolve(result);
        }
        if (typeof error === 'string') {
          resolve('');
        }
        resolve('');
      });
    });
  }

  // @override
  async getRepoFromPath(currentRepo, token, cb) {
    if (!giteaDetect.shouldEnable()) {
      return cb();
    }

    await this.getRepoData(currentRepo, token, cb);
  }

  // @override
  loadCodeTree(opts, cb) {
    opts.encodedBranch = encodeURIComponent(decodeURIComponent(opts.repo.branch));
    opts.path = (opts.node && (opts.node.sha || opts.encodedBranch)) || opts.encodedBranch + '?recursive=1';
    this._loadCodeTreeInternal(opts, null, cb);
  }

  // @override
  getAccessToken() {
    return window.extStore.get(window.STORE.GITEA_TOKEN);
  }

  // @override
  selectFile(path) {
    window.location.href = path;
  }

  // @override
  getItemHref(repo, type, encodedPath, encodedBranch) {
    return `/${repo.username}/${repo.reponame}/src/branch/${encodedBranch}/${encodedPath}`;
  }

  get isOnPRPage() {
    // eslint-disable-next-line no-useless-escape
    const match = window.location.pathname.match(/([^\/]+)\/([^\/]+)(?:\/([^\/]+))?(?:\/([^\/]+))?/);

    if (!match) return false;

    const type = match[3];

    return type === 'pulls';
  }

  // @override
  _getTree(path, opts, cb) {
    this._get(`/git/trees/${path}`, opts, (err, res) => {
      if (err) {
        cb(err);
      } else {
        cb(null, res.tree);
      }
    });
  }

  /**
   * Get files that were patched in Pull Request.
   * The diff map that is returned contains changed files, as well as the parents of the changed files.
   * This allows the tree to be filtered for only folders that contain files with diffs.
   * @param {Object} opts: {
   *                  path: the starting path to load the tree,
   *                  repo: the current repository,
   *                  node (optional): the selected node (null to load entire tree),
   *                  token (optional): the personal access token
   *                 }
   * @param {Function} cb(err: error, diffMap: Object)
   */
  _getPatch(opts, cb) {
    const { pullNumber } = opts.repo;

    this._get(`/pulls/${pullNumber}/files?per_page=300`, opts, (err, res) => {
      if (err) {
        cb(err);
      } else {
        const diffMap = {};

        res.forEach((file, index) => {
          // Record file patch info
          diffMap[file.filename] = {
            type: 'blob',
            diffId: index,
            action: file.status,
            additions: file.additions,
            blob_url: file.blob_url,
            deletions: file.deletions,
            filename: file.filename,
            path: file.path,
            sha: file.sha,
          };

          // Record ancestor folders
          const folderPath = file.filename
            .split('/')
            .slice(0, -1)
            .join('/');
          const split = folderPath.split('/');

          // Aggregate metadata for ancestor folders
          split.reduce((path, curr) => {
            if (path.length) {
              path = `${path}/${curr}`;
            } else {
              path = `${curr}`;
            }

            if (diffMap[path] == null) {
              diffMap[path] = {
                type: 'tree',
                filename: path,
                filesChanged: 1,
                additions: file.additions,
                deletions: file.deletions,
              };
            } else {
              diffMap[path].additions += file.additions;
              diffMap[path].deletions += file.deletions;
              diffMap[path].filesChanged++;
            }
            return path;
          }, '');
        });

        // Transform to emulate response from get `tree`
        const tree = Object.keys(diffMap).map(fileName => {
          const patch = diffMap[fileName];
          return {
            patch,
            path: fileName,
            sha: patch.sha,
            type: patch.type,
            url: patch.blob_url,
          };
        });

        // Sort by path, needs to be alphabetical order (so parent folders come before children)
        // Note: this is still part of the above transform to mimic the behavior of get tree
        tree.sort((a, b) => a.path.localeCompare(b.path));

        cb(null, tree);
      }
    });
  }

  // @override
  _getSubmodules(tree, opts, cb) {
    const item = tree.filter(item => /^\.gitmodules$/i.test(item.path))[0];
    if (!item) return cb();

    this._get(`/git/blobs/${item.sha}`, opts, (err, res) => {
      if (err) return cb(err);
      const data = atob(res.content.replace(/\n/g, ''));
      cb(null, parseGitmodules(data));
    });
  }

  async loadRepoData(path, isRepoMetaData = false) {
    const token = await this.getAccessToken();

    try {
      const repo = await this.getRepoDataWrap(false, token);

      if (repo) {
        const data = await this.getContent(path, {
          repo,
          isRepoMetaData,
        });

        return {
          repo,
          contentData: data,
        };
      }
    } catch (e) {
      return false;
    }
  }

  getContentPath() {
    let str = window.location.href;
    let result = str.match(/.*[bt][lr][oe][be]\/[^//]+\/(.*)/); // blob/tree :D
    return result && result.length && result[1];
  }

  async getContent(path, opts) {
    const host = window.location.protocol + '//' + (window.location.host === 'github.com' ? 'api.github.com' : window.location.host + '/api/v1');
    const url = `${host}/repos/${opts.repo.username}/${opts.repo.reponame}`;

    const contentPath = path || this.getContentPath() || '';

    let contentParams = '';

    const branch = encodeURIComponent(decodeURIComponent(opts.repo.branch));

    if (!opts.isRepoMetaData) {
      contentParams = '/contents/' + contentPath + '?ref=' + branch;
    }

    const cfg = {
      url: `${url}${contentParams}`,
      method: 'GET',
      cache: false,
    };

    const token = await this.getAccessToken();

    if (token) {
      cfg.headers = { Authorization: 'token ' + token };
    }

    return new Promise((resolve, reject) => {
      $.ajax(cfg)
        .done((data, textStatus, jqXHR) => {
          resolve(data, jqXHR);
        })
        .fail(jqXHR => this._handleError(cfg, jqXHR, resolve));
    });
  }

  _get(path, opts, cb) {
    let url;

    if (path && path.startsWith('http')) {
      url = path;
    } else {
      const host = window.location.protocol + '//' + window.location.host + '/api/v1';
      url = `${host}/repos/${opts.repo.username}/${opts.repo.reponame}${path || ''}`;
    }

    const cfg = {
      url,
      method: 'GET',
      cache: false,
    };

    if (opts.token) {
      cfg.headers = { Authorization: 'token ' + opts.token };
    }

    $.ajax(cfg)
      .done((data, textStatus, jqXHR) => {
        (async () => {
          if (path && path.indexOf('/git/trees') === 0 && data.truncated) {
            try {
              const hugeRepos = await extStore.get(STORE.HUGE_REPOS);
              const repo = `${opts.repo.username}/${opts.repo.reponame}`;
              const repos = Object.keys(hugeRepos).filter(hugeRepoKey => isValidTimeStamp(hugeRepos[hugeRepoKey]));
              if (!hugeRepos[repo]) {
                // If there are too many repos memoized, delete the oldest one
                if (repos.length >= GH_MAX_HUGE_REPOS_SIZE) {
                  const oldestRepo = repos.reduce((min, p) => (hugeRepos[p] < hugeRepos[min] ? p : min));
                  delete hugeRepos[oldestRepo];
                }
                hugeRepos[repo] = new Date().getTime();
                await extStore.set(STORE.HUGE_REPOS, hugeRepos);
              }
              // eslint-disable-next-line no-empty
            } catch (ignored) {
            } finally {
              await this._handleError(cfg, { status: 206 }, cb);
            }
          } else {
            cb(null, data, jqXHR);
          }
        })();
      })
      .fail(jqXHR => this._handleError(cfg, jqXHR, cb));
  }
}

export default Gitea;
