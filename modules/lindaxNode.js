const _ = require('./utils/underscore.js');
const fs = require('fs');
const Q = require('bluebird');
const spawn = require('child_process').spawn;
const { dialog } = require('electron');
const Windows = require('./windows.js');
const logRotate = require('log-rotate');
const path = require('path');
const EventEmitter = require('events').EventEmitter;
const Sockets = require('./socketManager');
const ClientBinaryManager = require('./clientBinaryManager');
import Settings from './settings';
import {
  syncLocalNode,
  resetLocalNode,
  updateLocalBlock
} from './core/nodes/actions';

import logger from './utils/logger';
const lindaxNodeLog = logger.create('LindaXNode');

const DEFAULT_NODE_TYPE = 'glinx';
const DEFAULT_NETWORK = 'main';
const DEFAULT_SYNCMODE = 'fast';

const UNABLE_TO_BIND_PORT_ERROR = 'unableToBindPort';
const NODE_START_WAIT_MS = 3000;

const STATES = {
  STARTING: 0 /* Node about to be started */,
  STARTED: 1 /* Node started */,
  CONNECTED: 2 /* IPC connected - all ready */,
  STOPPING: 3 /* Node about to be stopped */,
  STOPPED: 4 /* Node stopped */,
  ERROR: -1 /* Unexpected error */
};

let instance;

/**
 * Etheruem nodes manager.
 */
class LindaXNode extends EventEmitter {
  constructor() {
    super();

    if (!instance) {
      instance = this;
    }

    this.STATES = STATES;

    // Set default states
    this.state = STATES.STOPPED;
    this.isExternalNode = false;

    this._loadDefaults();

    this._node = null;
    this._type = null;
    this._network = null;

    this._socket = Sockets.get('node-ipc', Settings.rpcMode);

    this.on('data', _.bind(this._logNodeData, this));

    return instance;
  }

  get isOwnNode() {
    return !this.isExternalNode;
  }

  get isIpcConnected() {
    return this._socket.isConnected;
  }

  get type() {
    return this.isOwnNode ? this._type : null;
  }

  get network() {
    return this._network;
  }

  get syncMode() {
    return this._syncMode;
  }

  get isEth() {
    return this._type === 'eth';
  }

  get isGlinx() {
    return this._type === 'glinx';
  }

  get isMainNetwork() {
    return this.network === 'main';
  }

  get isTestNetwork() {
    return this.network === 'test' || this.network === 'trajectory';
  }

  get isDevNetwork() {
    return this.network === 'dev';
  }

  get isLightMode() {
    return this._syncMode === 'light';
  }

  get state() {
    return this._state;
  }

  get stateAsText() {
    switch (this._state) {
      case STATES.STARTING:
        return 'starting';
      case STATES.STARTED:
        return 'started';
      case STATES.CONNECTED:
        return 'connected';
      case STATES.STOPPING:
        return 'stopping';
      case STATES.STOPPED:
        return 'stopped';
      case STATES.ERROR:
        return 'error';
      default:
        return false;
    }
  }

  set state(newState) {
    this._state = newState;

    this.emit('state', this.state, this.stateAsText);
  }

  get lastError() {
    return this._lastErr;
  }

  set lastError(err) {
    this._lastErr = err;
  }

  /**
   * This method should always be called first to initialise the connection.
   * @return {Promise}
   */
  init() {
    return this._socket
      .connect(Settings.rpcConnectConfig)
      .then(() => {
        this.isExternalNode = true;
        this.state = STATES.CONNECTED;
        store.dispatch({ type: '[MAIN]:LOCAL_NODE:CONNECTED' });
        this.emit('runningNodeFound');
        this.setNetwork();
        return null;
      })
      .catch(() => {
        this.isExternalNode = false;

        lindaxNodeLog.warn(
          'Failed to connect to an existing local node. Starting our own...'
        );

        lindaxNodeLog.info(`Node type: ${this.defaultNodeType}`);
        lindaxNodeLog.info(`Network: ${this.defaultNetwork}`);
        lindaxNodeLog.info(`SyncMode: ${this.defaultSyncMode}`);

        return this._start(
          this.defaultNodeType,
          this.defaultNetwork,
          this.defaultSyncMode
        ).catch(err => {
          lindaxNodeLog.error('Failed to start node', err);
          throw err;
        });
      });
  }

  restart(newType, newNetwork, syncMode) {
    return Q.try(() => {
      if (!this.isOwnNode) {
        throw new Error('Cannot restart node since it was started externally');
      }

      lindaxNodeLog.info('Restart node', newType, newNetwork);

      return this.stop()
        .then(async () => {
          await Sockets.destroyAll();
          this._socket = Sockets.get('node-ipc', Settings.rpcMode);
          return null;
        })
        .then(() =>
          this._start(
            newType || this.type,
            newNetwork || this.network,
            syncMode || this.syncMode
          )
        )
        .catch(err => {
          lindaxNodeLog.error('Error restarting node', err);
          throw err;
        });
    });
  }

  /**
   * Stop node.
   *
   * @return {Promise}
   */
  stop() {
    if (!this._stopPromise) {
      return new Q(resolve => {
        if (!this._node) {
          return resolve();
        }

        clearInterval(this.syncInterval);
        clearInterval(this.watchlocalBlocksInterval);

        this.state = STATES.STOPPING;

        lindaxNodeLog.info(
          `Stopping existing node: ${this._type} ${this._network}`
        );

        this._node.stderr.removeAllListeners('data');
        this._node.stdout.removeAllListeners('data');
        this._node.stdin.removeAllListeners('error');
        this._node.removeAllListeners('error');
        this._node.removeAllListeners('exit');

        this._node.kill('SIGINT');

        // after some time just kill it if not already done so
        const killTimeout = setTimeout(() => {
          if (this._node) {
            this._node.kill('SIGKILL');
          }
        }, 8000 /* 8 seconds */);

        this._node.once('close', () => {
          clearTimeout(killTimeout);

          this._node = null;

          resolve();
        });
      })
        .then(() => {
          this.state = STATES.STOPPED;
          this._stopPromise = null;
        })
        .then(() => {
          // Reset block values in store
          store.dispatch(resetLocalNode());
        });
    }
    lindaxNodeLog.debug(
      'Disconnection already in progress, returning Promise.'
    );
    return this._stopPromise;
  }

  /**
   * Send Web3 command to socket.
   * @param  {String} method Method name
   * @param  {Array} [params] Method arguments
   * @return {Promise} resolves to result or error.
   */
  async send(method, params) {
    const ret = await this._socket.send({ method, params });
    return ret;
  }

  /**
   * Start a lindax node.
   * @param  {String} nodeType glinx, eth, etc
   * @param  {String} network  network id
   * @param  {String} syncMode full, fast, light, nosync
   * @return {Promise}
   */
  _start(nodeType, network, syncMode) {
    lindaxNodeLog.info(`Start node: ${nodeType} ${network} ${syncMode}`);

    if (network === 'test' || network === 'trajectory') {
      lindaxNodeLog.debug('Node will connect to the test network');
    }

    return this.stop()
      .then(() => {
        return this.__startNode(nodeType, network, syncMode).catch(err => {
          lindaxNodeLog.error('Failed to start node', err);

          this._showNodeErrorDialog(nodeType, network);

          throw err;
        });
      })
      .then(proc => {
        lindaxNodeLog.info(
          `Started node successfully: ${nodeType} ${network} ${syncMode}`
        );

        this._node = proc;
        this.state = STATES.STARTED;

        Settings.saveUserData('node', this._type);
        Settings.saveUserData('network', this._network);
        Settings.saveUserData('syncmode', this._syncMode);

        return this._socket
          .connect(
            Settings.rpcConnectConfig,
            {
              timeout: 30000 /* 30s */
            }
          )
          .then(() => {
            this.state = STATES.CONNECTED;
            this._checkSync();
          })
          .catch(err => {
            lindaxNodeLog.error('Failed to connect to node', err);

            if (err.toString().indexOf('timeout') >= 0) {
              this.emit('nodeConnectionTimeout');
            }

            this._showNodeErrorDialog(nodeType, network);

            throw err;
          });
      })
      .catch(err => {
        // set before updating state so that state change event observers
        // can pick up on this
        this.lastError = err.tag;
        this.state = STATES.ERROR;

        // if unable to start eth node then write glinx to defaults
        if (nodeType === 'eth') {
          Settings.saveUserData('node', 'glinx');
        }

        throw err;
      });
  }

  /**
   * @return {Promise}
   */
  __startNode(nodeType, network, syncMode) {
    this.state = STATES.STARTING;

    this._network = network;
    this._type = nodeType;
    this._syncMode = syncMode;

    store.dispatch({
      type: '[MAIN]:NODES:CHANGE_NETWORK_SUCCESS',
      payload: { network }
    });

    store.dispatch({
      type: '[MAIN]:NODES:CHANGE_SYNC_MODE',
      payload: { syncMode }
    });

    const client = ClientBinaryManager.getClient(nodeType);
    let binPath;

    if (client) {
      binPath = client.binPath;
    } else {
      throw new Error(`Node "${nodeType}" binPath is not available.`);
    }

    lindaxNodeLog.info(`Start node using ${binPath}`);

    return new Q((resolve, reject) => {
      this.__startProcess(nodeType, network, binPath, syncMode).then(
        resolve,
        reject
      );
    });
  }

  /**
   * @return {Promise}
   */
  __startProcess(nodeType, network, binPath, _syncMode) {
    let syncMode = _syncMode;
    if (nodeType === 'glinx' && !syncMode) {
      syncMode = DEFAULT_SYNCMODE;
    }

    return new Q((resolve, reject) => {
      lindaxNodeLog.trace('Rotate log file');

      logRotate(
        path.join(Settings.userDataPath, 'logs', 'all.log'),
        { count: 5 },
        error => {
          if (error) {
            lindaxNodeLog.error('Log rotation problems', error);
            return reject(error);
          }
        }
      );

      logRotate(
        path.join(Settings.userDataPath, 'logs', 'category', 'lindax_node.log'),
        { count: 5 },
        error => {
          if (error) {
            lindaxNodeLog.error('Log rotation problems', error);
            return reject(error);
          }
        }
      );

      let args;

      switch (network) {
        // Starts Trajectory network
        case 'trajectory':
        // fall through
        case 'test':
          args = [
            '--testnet',
            '--cache',
            process.arch === 'x64' ? '1024' : '512',
            '--ipcpath',
            Settings.rpcIpcPath
          ];
          if (syncMode === 'nosync') {
            args.push('--nodiscover', '--maxpeers=0');
          } else {
            args.push('--syncmode', syncMode);
          }
          break;

        // Starts Rinkeby network
        case 'rinkeby':
          args = [
            '--rinkeby',
            '--cache',
            process.arch === 'x64' ? '1024' : '512',
            '--ipcpath',
            Settings.rpcIpcPath
          ];
          if (syncMode === 'nosync') {
            args.push('--nodiscover', '--maxpeers=0');
          } else {
            args.push('--syncmode', syncMode);
          }
          break;

        // Starts local network
        case 'dev':
          args = [
            '--dev',
            '--minerthreads',
            '1',
            '--ipcpath',
            Settings.rpcIpcPath
          ];
          break;

        // Starts Main net
        default:
          args =
            nodeType === 'glinx'
              ? ['--cache', process.arch === 'x64' ? '1024' : '512']
              : ['--unsafe-transactions'];
          if (nodeType === 'glinx' && syncMode === 'nosync') {
            args.push('--nodiscover', '--maxpeers=0');
          } else {
            args.push('--syncmode', syncMode);
          }
      }

      const nodeOptions = Settings.nodeOptions;

      if (nodeOptions && nodeOptions.length) {
        lindaxNodeLog.debug('Custom node options', nodeOptions);

        args = args.concat(nodeOptions);
      }

      lindaxNodeLog.info(`Start node args: ${args}`);

      lindaxNodeLog.trace('Spawn', binPath, args);

      const proc = spawn(binPath, args);

      proc.once('error', error => {
        if (this.state === STATES.STARTING) {
          this.state = STATES.ERROR;

          lindaxNodeLog.info('Node startup error');

          // TODO: detect this properly
          // this.emit('nodeBinaryNotFound');

          reject(error);
        }
      });

      proc.stdout.on('data', data => {
        lindaxNodeLog.trace('Got stdout data', data.toString());
        this.emit('data', data);
      });

      proc.stderr.on('data', data => {
        lindaxNodeLog.trace('Got stderr data', data.toString());
        lindaxNodeLog.info(data.toString()); // TODO: This should be lindaxNodeLog.error(), but not sure why regular stdout data is coming in through stderror
        this.emit('data', data);
      });

      // when data is first received
      this.once('data', () => {
        /*
                    We wait a short while before marking startup as successful
                    because we may want to parse the initial node output for
                    errors, etc (see glinx port-binding error above)
                */
        setTimeout(() => {
          if (STATES.STARTING === this.state) {
            lindaxNodeLog.info(
              `${NODE_START_WAIT_MS}ms elapsed, assuming node started up successfully`
            );
            resolve(proc);
          }
        }, NODE_START_WAIT_MS);
      });
    });
  }

  _showNodeErrorDialog(nodeType, network) {
    let log = path.join(Settings.userDataPath, 'logs', 'all.log');

    if (log) {
      log = `...${log.slice(-1000)}`;
    } else {
      log = global.i18n.t('mist.errors.nodeStartup');
    }

    // add node type
    log =
      `Node type: ${nodeType}\n` +
      `Network: ${network}\n` +
      `Platform: ${process.platform} (Architecture ${process.arch})\n\n${log}`;

    dialog.showMessageBox(
      {
        type: 'error',
        buttons: ['OK'],
        message: global.i18n.t('mist.errors.nodeConnect'),
        detail: log
      },
      () => {}
    );
  }

  _logNodeData(data) {
    const cleanData = data.toString().replace(/[\r\n]+/, '');
    const nodeType = (this.type || 'node').toUpperCase();

    lindaxNodeLog.trace(`${nodeType}: ${cleanData}`);

    if (!/^-*$/.test(cleanData) && !_.isEmpty(cleanData)) {
      this.emit('nodeLog', cleanData);
    }

    // check for glinx startup errors
    if (STATES.STARTING === this.state) {
      const dataStr = data.toString().toLowerCase();
      if (nodeType === 'glinx') {
        if (dataStr.indexOf('fatal: error') >= 0) {
          const error = new Error(`Glinx error: ${dataStr}`);

          if (dataStr.indexOf('bind') >= 0) {
            error.tag = UNABLE_TO_BIND_PORT_ERROR;
          }

          lindaxNodeLog.error(error);
          return reject(error);
        }
      }
    }
  }

  _loadDefaults() {
    lindaxNodeLog.trace('Load defaults');

    this.defaultNodeType =
      Settings.nodeType || Settings.loadUserData('node') || DEFAULT_NODE_TYPE;
    this.defaultNetwork =
      Settings.network || Settings.loadUserData('network') || DEFAULT_NETWORK;
    this.defaultSyncMode =
      Settings.syncmode ||
      Settings.loadUserData('syncmode') ||
      DEFAULT_SYNCMODE;

    lindaxNodeLog.info(
      Settings.syncmode,
      Settings.loadUserData('syncmode'),
      DEFAULT_SYNCMODE
    );
    lindaxNodeLog.info(
      `Defaults loaded: ${this.defaultNodeType} ${this.defaultNetwork} ${
        this.defaultSyncMode
      }`
    );
    store.dispatch({
      type: '[MAIN]:NODES:CHANGE_NETWORK_SUCCESS',
      payload: { network: this.defaultNetwork }
    });
    store.dispatch({
      type: '[MAIN]:NODES:CHANGE_SYNC_MODE',
      payload: { syncMode: this.defaultSyncMode }
    });
  }

  _checkSync() {
    // Reset
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(async () => {
      const syncingResult = await this.send('eth_syncing');
      const sync = syncingResult.result;
      if (sync === false) {
        const blockNumberResult = await this.send('eth_blockNumber');
        const blockNumber = parseInt(blockNumberResult.result, 16);
        if (blockNumber > 0) {
          // Sync is caught up
          clearInterval(this.syncInterval);
          this._watchLocalBlocks();
        }
      } else if (_.isObject(sync)) {
        store.dispatch(syncLocalNode(sync));
      }
    }, 1500);
  }

  _watchLocalBlocks() {
    // Reset
    if (this.watchlocalBlocksInterval) {
      clearInterval(this.watchlocalBlocksInterval);
    }

    this.watchlocalBlocksInterval = setInterval(async () => {
      const blockResult = await this.send('eth_getBlockByNumber', [
        'latest',
        false
      ]);
      const block = blockResult.result;
      if (block && block.number > store.getState().nodes.local.blockNumber) {
        store.dispatch(
          updateLocalBlock(
            parseInt(block.number, 16),
            parseInt(block.timestamp, 16)
          )
        );
      }
    }, 1500);
  }

  async setNetwork() {
    const network = await this.getNetwork();
    this._network = network;

    store.dispatch({
      type: '[MAIN]:NODES:CHANGE_NETWORK_SUCCESS',
      payload: { network }
    });

    store.dispatch({
      type: '[MAIN]:NODES:CHANGE_SYNC_MODE',
      payload: { syncMode: null }
    });
  }

  async getNetwork() {
    const blockResult = await this.send('eth_getBlockByNumber', ['0x0', false]);
    const block = blockResult.result;
    switch (block.hash) {
      case '0xaa9da902a93b360bec5f2401d2bdfae952a03b331f7dc7e7560ec5a20ed1148e':
        return 'main';
      case '0x0b6193d6734e1cd18381f477102f7be9e354d051f44aeab1acde8e56f6863490':
        return 'trajectory';
      default:
        return 'private';
    }
  }
}

LindaXNode.STARTING = 0;

module.exports = new LindaXNode();
