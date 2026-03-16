import { promises as fs, readFileSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import selfsigned from 'selfsigned';

const execAsync = promisify(exec);

const DEFAULT_CERT_DIR = path.join(os.homedir(), '.devgate', 'certs');
const DEFAULT_CERT_NAME = 'devgate';
const CERT_EXPIRY_DAYS = 365;

export class CertManager {
  constructor(options = {}) {
    this.certDir = options.certDir || DEFAULT_CERT_DIR;
    this.selfSignedFallback = options.selfSignedFallback !== false;
    this.certPath = path.join(this.certDir, `${DEFAULT_CERT_NAME}.pem`);
    this.keyPath = path.join(this.certDir, `${DEFAULT_CERT_NAME}.key`);
    this.mode = null;
    this.expiration = null;
    this._mkcertAvailable = null;
    this._lastHostnames = null;
  }

  /**
   * Check if mkcert is available in the system PATH
   */
  async checkMkcert() {
    if (this._mkcertAvailable !== null) {
      return this._mkcertAvailable;
    }

    try {
      const result = execSync('mkcert --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      this._mkcertAvailable = result.includes('mkcert') || result.match(/v\d+\.\d+\.\d+/);
    } catch (error) {
      this._mkcertAvailable = false;
    }

    return this._mkcertAvailable;
  }

  /**
   * Try to install mkcert automatically
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async installMkcert() {
    const platform = process.platform;
    const results = { success: false, message: '' };

    if (platform === 'win32') {
      return this._installMkcertWindows();
    } else if (platform === 'darwin') {
      return this._installMkcertMac();
    } else {
      return this._installMkcertLinux();
    }
  }

  async _installMkcertWindows() {
    try {
      try {
        const wingetResult = execSync('winget --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        if (wingetResult.includes('winget')) {
          console.log('Installing mkcert via winget...');
          execSync('winget install -e --id FiloSottile.mkcert --accept-source-agreements --accept-package-agreements', { stdio: 'inherit' });
          
          const verify = await this.checkMkcert();
          if (verify) {
            console.log('Running mkcert -install to create local CA...');
            try {
              execSync('mkcert -install', { stdio: 'inherit' });
              return { success: true, message: 'mkcert installed and CA created successfully via winget' };
            } catch {
              return { success: true, message: 'mkcert installed successfully via winget. Run "mkcert -install" manually to create CA.' };
            }
          }
        }
      } catch {
      }

      try {
        const chocoResult = execSync('choco --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        if (chocoResult.includes('Chocolatey')) {
          console.log('Installing mkcert via Chocolatey...');
          execSync('choco install mkcert -y', { stdio: 'inherit' });
          
          const verify = await this.checkMkcert();
          if (verify) {
            console.log('Running mkcert -install to create local CA...');
            try {
              execSync('mkcert -install', { stdio: 'inherit' });
              return { success: true, message: 'mkcert installed and CA created successfully via Chocolatey' };
            } catch {
              return { success: true, message: 'mkcert installed successfully via Chocolatey. Run "mkcert -install" manually to create CA.' };
            }
          }
        }
      } catch {
      }

      return { 
        success: false, 
        message: 'Could not install mkcert automatically. Please install manually:\n  winget install -e --id FiloSottile.mkcert\n  or\n  choco install mkcert'
      };
    } catch (error) {
      return { success: false, message: `Failed to install mkcert: ${error.message}` };
    }
  }

  async _installMkcertMac() {
    try {
      const brewResult = execSync('brew --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      if (brewResult.includes('Homebrew')) {
        console.log('Installing mkcert via Homebrew...');
        execSync('brew install mkcert', { stdio: 'inherit' });
        
        const verify = await this.checkMkcert();
        if (verify) {
          console.log('Running mkcert -install to create local CA...');
          try {
            execSync('mkcert -install', { stdio: 'inherit' });
            return { success: true, message: 'mkcert installed and CA created successfully via Homebrew' };
          } catch {
            return { success: true, message: 'mkcert installed successfully via Homebrew. Run "mkcert -install" manually to create CA.' };
          }
        }
      }
      
      return { 
        success: false, 
        message: 'Could not install mkcert automatically. Please install manually:\n  brew install mkcert'
      };
    } catch (error) {
      return { success: false, message: `Failed to install mkcert: ${error.message}` };
    }
  }

  async _installMkcertLinux() {
    try {
      const hasApt = await this._commandExists('apt');
      const hasYum = await this._commandExists('yum');
      const hasDnf = await this._commandExists('dnf');
      
      if (hasApt) {
        console.log('Installing mkcert via apt...');
        execSync('sudo apt install libnss3-tools', { stdio: 'inherit' });
        execSync('sudo apt install mkcert', { stdio: 'inherit' });
        
        const verify = await this.checkMkcert();
        if (verify) {
          console.log('Running mkcert -install to create local CA...');
          try {
            execSync('sudo mkcert -install', { stdio: 'inherit' });
            return { success: true, message: 'mkcert installed and CA created successfully via apt' };
          } catch {
            return { success: true, message: 'mkcert installed successfully via apt. Run "sudo mkcert -install" manually to create CA.' };
          }
        }
      } else if (hasYum || hasDnf) {
        const pkgManager = hasDnf ? 'dnf' : 'yum';
        console.log(`Installing mkcert via ${pkgManager}...`);
        execSync(`sudo ${pkgManager} install nss-tools`, { stdio: 'inherit' });
        
        const arch = process.arch === 'x64' ? 'amd64' : 'arm64';
        const version = 'v1.4.4';
        execSync(`sudo curl -L -o /usr/local/bin/mkcert https://github.com/FiloSottile/mkcert/releases/download/${version}/mkcert-${version}-linux-${arch}`, { stdio: 'inherit' });
        execSync('sudo chmod +x /usr/local/bin/mkcert', { stdio: 'inherit' });
        
        const verify = await this.checkMkcert();
        if (verify) {
          console.log('Running sudo mkcert -install to create local CA...');
          try {
            execSync('sudo mkcert -install', { stdio: 'inherit' });
            return { success: true, message: 'mkcert installed and CA created successfully' };
          } catch {
            return { success: true, message: 'mkcert installed successfully. Run "sudo mkcert -install" manually to create CA.' };
          }
        }
      }
      
      return { 
        success: false, 
        message: 'Could not install mkcert automatically. Please install manually:\n  sudo apt install mkcert  # Debian/Ubuntu\n  sudo dnf install mkcert  # Fedora'
      };
    } catch (error) {
      return { success: false, message: `Failed to install mkcert: ${error.message}` };
    }
  }

  async _commandExists(command) {
    try {
      execSync(`which ${command}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure the certificate directory exists
   */
  async _ensureCertDir() {
    try {
      await fs.mkdir(this.certDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Parse expiration date and SAN from PEM cert data
   * Returns { expirationDate, subjectAltName } or null if unparseable
   */
  _parseCertData(certData) {
    try {
      if (typeof crypto.X509Certificate.createFromPem === 'function') {
        const certObj = crypto.X509Certificate.createFromPem(certData);
        return { expirationDate: new Date(certObj.validTo), subjectAltName: certObj.subjectAltName };
      } else if (typeof crypto.X509Certificate === 'function') {
        const certObj = new crypto.X509Certificate(certData);
        return { expirationDate: new Date(certObj.validTo), subjectAltName: certObj.subjectAltName };
      }
    } catch {
      // fall through to regex
    }
    const expMatch = certData.match(/notAfter=([^,\n]+)/);
    if (!expMatch) return null;
    const sanMatch = certData.match(/subjectAltName=([^,\n]+)/);
    return {
      expirationDate: new Date(expMatch[1]),
      subjectAltName: sanMatch ? sanMatch[1] : null
    };
  }

  /**
   * Check if existing certificates are valid for the given hostnames
   */
  async _areCertificatesValid(hostnames) {
    try {
      const certData = await fs.readFile(this.certPath, 'utf8');

      const parsed = this._parseCertData(certData);
      if (!parsed) return false;
      const { expirationDate, subjectAltName } = parsed;
      
      const now = new Date();
      if (expirationDate < now) {
        return false;
      }
      this.expiration = expirationDate.toISOString();

      if (!subjectAltName) {
        return false;
      }

      const sans = subjectAltName.split(', ').map(san => {
        if (san.startsWith('DNS:')) {
          return san.substring(4);
        }
        return null;
      }).filter(Boolean);

      for (const hostname of hostnames) {
        if (!sans.includes(hostname) && !sans.includes(`*.${hostname.split('.').slice(-2).join('.')}`)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate SAN (Subject Alternative Name) certificate using mkcert
   */
  async _generateWithMkcert(hostnames) {
    await this._ensureCertDir();

    const allHostnames = [...new Set([
      'localhost',
      '127.0.0.1',
      '::1',
      ...hostnames
    ])];

    const certFile = this.certPath;
    const keyFile = this.keyPath;

    try {
      const args = [
        '-cert-file', certFile,
        '-key-file', keyFile,
        ...allHostnames
      ];

      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);
      await execFileAsync('mkcert', args, {
        cwd: this.certDir
      });

      this.mode = 'mkcert';

      const certData = await fs.readFile(certFile, 'utf8');
      const parsed = this._parseCertData(certData);
      if (parsed) {
        this.expiration = parsed.expirationDate.toISOString();
      }

      return true;
    } catch (error) {
      throw new Error(`mkcert certificate generation failed: ${error.message}`);
    }
  }

  /**
   * Generate self-signed SAN certificate using selfsigned package
   */
  async _generateSelfSigned(hostnames) {
    await this._ensureCertDir();

    const allHostnames = [...new Set([
      'localhost',
      '127.0.0.1',
      '::1',
      ...hostnames
    ])];

    const attrs = [{ name: 'commonName', value: allHostnames[0] }];
    const cert = await selfsigned.generate(attrs, {
      days: CERT_EXPIRY_DAYS,
      keySize: 2048,
      altNames: allHostnames.map(hostname => {
        if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/) || hostname === '::1') {
          return { type: 7, value: hostname };
        }
        return { type: 2, value: hostname };
      })
    });

    await fs.writeFile(this.certPath, cert.cert, 'utf8');
    await fs.writeFile(this.keyPath, cert.private, 'utf8');

    this.mode = 'self-signed';
    this.expiration = new Date(
      Date.now() + (CERT_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    ).toISOString();

    return true;
  }

  /**
   * Generate a cert using mkcert if available, then fall back to self-signed.
   * @param {string[]} hostnames
   * @param {string} warnPrefix - message prefix when mkcert fails
   */
  async _generateCert(hostnames, warnPrefix) {
    const mkcertAvailable = await this.checkMkcert();
    if (mkcertAvailable) {
      try {
        await this._generateWithMkcert(hostnames);
        return;
      } catch (error) {
        console.warn(`${warnPrefix}: ${error.message}`);
        if (!this.selfSignedFallback) throw error;
      }
    }
    if (this.selfSignedFallback) {
      await this._generateSelfSigned(hostnames);
    } else if (!mkcertAvailable) {
      throw new Error('mkcert is not available and self-signed fallback is disabled');
    }
  }

  /**
   * Ensure certificates exist and are valid for the given hostnames
   * @param {string[]} hostnames - List of hostnames to include in certificate
   */
  async ensureCertificates(hostnames) {
    const existingValid = await this._areCertificatesValid(hostnames);
    const hostnamesChanged = this._lastHostnames &&
      JSON.stringify(this._lastHostnames.sort()) !== JSON.stringify(hostnames.sort());

    if (!existingValid) {
      await this._generateCert(hostnames, 'mkcert failed, falling back to self-signed');
    } else if (hostnamesChanged) {
      await this._generateCert(hostnames, 'mkcert failed during regeneration');
    }

    this._lastHostnames = hostnames;
    return true;
  }

  /**
   * Get information about the current certificate
   * @returns {Object} Certificate info
   */
  getCertificateInfo() {
    try {
      const certContent = existsSync(this.certPath) ? readFileSync(this.certPath, 'utf8') : null;
      const keyContent = existsSync(this.keyPath) ? readFileSync(this.keyPath, 'utf8') : null;
      
      return {
        mode: this.mode,
        certPath: this.certPath,
        keyPath: this.keyPath,
        expiration: this.expiration,
        certDir: this.certDir,
        cert: certContent,
        key: keyContent
      };
    } catch (error) {
      console.error('[cert] Error reading certificate:', error.message);
      return {
        mode: this.mode,
        certPath: this.certPath,
        keyPath: this.keyPath,
        expiration: this.expiration,
        certDir: this.certDir,
        cert: null,
        key: null
      };
    }
  }

  /**
   * Force regeneration of certificates
   * @param {string[]} hostnames - List of hostnames to include in certificate
   */
  async regenerate(hostnames) {
    try {
      await fs.unlink(this.certPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    try {
      await fs.unlink(this.keyPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    this._lastHostnames = null;
    this.expiration = null;

    await this.ensureCertificates(hostnames);
  }
}

export default CertManager;
