import React from 'react';

class About extends React.Component {
  render() {
    const appIconPath = `file://${window.dirname}/icons/${
      window.mistMode
    }/icon2x.png`;
    const appName = window.mistMode === 'mist' ? 'Mist' : 'LindaX Wallet';

    return (
      <div className="row popup-windows about">
        <div className="col col-4 ">
          <img
            className={`left-overlay ${window.mistMode}`}
            src={appIconPath}
            style={{
              position: 'relative',
              top: '35px',
              left: '0',
              width: '100%'
            }}
          />
        </div>
        <div className="col col-8 ">
          <h1>{appName}</h1>
          <p>
            Version {window.mist.version}
            <br />
            License {window.mist.license}
            <br />
            <a
              href="https://github.com/thelindaprojectinc/lindax-wallet"
              target="_blank"
            >
              github.com/thelindaprojectinc/LindaX-Wallet
            </a>
          </p>
          <small>Copyright 2018 The Linda Project Inc</small>
        </div>
      </div>
    );
  }
}

export default About;
