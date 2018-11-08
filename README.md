## Help and troubleshooting

In order to get help regarding LindaX Wallet:

1.  Go to our [Discord channel](https://discord.gg/j4MebEY) to connect with the community for instant help.
1.  Search for [similar issues](https://github.com/thelindaprojectinc/lindax-wallet/issues?q=is%3Aopen+is%3Aissue+label%3A%22Type%3A+Canonical%22) and potential help.
1.  Or create a [new issue](https://github.com/thelindaprojectinc/lindax-wallet/issues) and provide as much information as you can to recreate your problem.

## How to contribute

Contributions via Pull Requests are welcome. You can see where to help looking for issues with the [Enhancement](https://github.com/thelindaprojectinc/lindax-wallet/issues?q=is%3Aopen+is%3Aissue+label%3A%22Type%3A+Enhancement%22) or [Bug](https://github.com/thelindaprojectinc/lindax-wallet/issues?q=is%3Aopen+is%3Aissue+label%3A%22Type%3A+Bug%22) labels. We can help guide you towards the solution.

You can also help by [responding to issues](https://github.com/thelindaprojectinc/lindax-wallet/issues?q=is%3Aissue+is%3Aopen+label%3A%22Status%3A+Triage%22).

## Installation

If you want to install the app from a pre-built version on the [release page](https://github.com/thelindaprojectinc/lindax-wallet/releases), you can simply run the executable after download.

For updating, simply download the new version and copy it over the old one (keep a backup of the old one if you want to be sure).

#### Linux .zip installs

In order to install from .zip files, please install `libgconf2-4` first:

```bash
apt-get install libgconf2-4
```

### Config folder

The data folder for LindaX Wallet depends on your operating system:

- Windows `%APPDATA%\LindaX Wallet`
- macOS `~/Library/Application\ Support/LindaX Wallet`
- Linux `~/.config/LindaX Wallet`

## Development

For development, a Meteor server assists with live reload and CSS injection.

Once a the LindaX Wallet version is released the Meteor frontend part is bundled using the `meteor-build-client` npm package to create pure static files.

### Dependencies

To run the LindaX Wallet in development you need:

- [Node.js](https://nodejs.org) `v7.x` (use the preferred installation method for your OS)
- [Meteor](https://www.meteor.com/install) javascript app framework
- [Yarn](https://yarnpkg.com/) package manager

Install the latter ones via:

```bash
$ curl https://install.meteor.com/ | sh
$ curl -o- -L https://yarnpkg.com/install.sh | bash
```

### Initialization

Now you're ready to initialize the LindaX Wallet for development:

```bash
$ git clone https://github.com/thelindaprojectinc/lindax-wallet.git
$ cd LindaX-Wallet
$ yarn
```

### Run LindaX Wallet

For development we start the interface with a Meteor server for auto-reload etc.

_Start the interface in a separate terminal window:_

```bash
$ yarn dev:meteor
```

_Start the LindaX Wallet interface in a separate terminal window:_

```bash
$ yarn dev:wallet
```

In the original window you can then start the wallet with:

```bash
$ yarn dev:electron
```

_NOTE: Client binaries (e.g. [glinx](https://github.com/thelindaprojectinc/go-lindax)) specified in [clientBinaries.json](https://github.com/thelindaprojectinc/lindax-wallet/blob/master/clientBinaries.json) will be checked during every startup and downloaded if out-of-date, binaries are stored in the [config folder](#config-folder)._

_NOTE: use `--help` to display available options, e.g. `--loglevel debug` (or `trace`) for verbose output_

### Passing options to Glinx

You can pass command-line options directly to Glinx by prefixing them with `--node-` in
the command-line invocation:

```bash
$ yarn dev:electron --node-rpcport 19343 --node-networkid 2
```

The `--rpc` wallet option is a special case. If you set this to an IPC socket file
path then the `--ipcpath` option automatically gets set, i.e.:

```bash
$ yarn dev:electron --rpc path/to/glinx.ipc
```

...is the same as doing...

```bash
$ yarn dev:electron --rpc /my/glinx.ipc --node-ipcpath /path/to/glinx.ipc
```

### Creating a local private net

If you would like to quickly set up a local private network on your computer, run:

```bash
glinx --dev
```

Look for the IPC path in the resulting glinx output, then start the wallet with:

```bash
$ yarn dev:electron --rpc path/to/glinx.ipc
```

### Deployment

Our build system relies on [gulp](http://gulpjs.com/) and [electron-builder](https://github.com/electron-userland/electron-builder/).

#### Dependencies

Cross-platform builds require additional [`electron-builder` dependencies](https://www.electron.build/multi-platform-build).

##### macOS

```bash
$ brew install rpm
```

##### Windows

```bash
$ brew install wine --without-x11 mono makensis
```

##### Linux

```bash
$ brew install gnu-tar libicns graphicsmagick xz
```

#### Generate packages

To generate the LindaX Wallet:

```bash
$ yarn build:wallet
```

The generated binaries will be under `dist_wallet/release`.

#### Options

##### platform

To build binaries for specific platforms (default: all available) use the following flags:

```bash
$ yarn build:wallet --mac      # mac
$ yarn build:wallet --linux    # linux
$ yarn build:wallet --win      # windows
```

##### skipTasks

When building a binary, you can optionally skip some tasks — generally for testing purposes.

```bash
$ yarn build:wallet --mac --skipTasks=bundling-interface,release-dist
```

##### Checksums

Prints the SHA-256 checksums of the distributables.

It expects installer/zip files to be in the generated folders e.g. `dist_wallet/release`

```bash
$ yarn task checksums [--wallet]
```

#### Tasks found in gulpfile.js and gulpTasks/

Any other gulp task can be run using `yarn task`.

```bash
$ yarn task clean-dist
```

#### Cutting a release

1.  Install [release](https://github.com/zeit/release) globally:

    ```bash
    $ yarn global add release
    ```

2.  Create a git tag and a GitHub release:

    ```bash
    $ release <major|minor|patch>
    ```

3.  A generated release draft will open in the default browser. Edit the information and add assets as necessary.

## Testing

Tests run using [Spectron](https://github.com/electron/spectron/), a webdriver.io runner built for Electron.

First make sure to build the LindaX Wallet with:

```bash
$ yarn build:wallet
```

Then run the tests:

```bash
$ yarn test:unit:once
$ yarn test:e2e
```

_Note: Integration tests are not yet supported on Windows._
