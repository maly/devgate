import { promises as fs } from 'fs';
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
      this._mkcertAvailable = result.includes('mkcert');
    } catch (error) {
      this._mkcertAvailable = false;
    }

    return this._mkcertAvailable;
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
   * Check if existing certificates are valid for the given hostnames
   */
  async _areCertificatesValid(hostnames) {
    try {
      const certData = await fs.readFile(this.certPath, 'utf8');
      const certObj = crypto.X509Certificate.createFromPem(certData);
      
      const expirationDate = new Date(certObj.validTo);
      const now = new Date();
      if (expirationDate < now) {
        return false;
      }
      this.expiration = expirationDate.toISOString();

      const subjectAltName = certObj.subjectAltName;
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

      await execAsync(`mkcert ${args.join(' ')}`, { 
        cwd: this.certDir,
        stdio: 'pipe'
      });

      this.mode = 'mkcert';
      
      const certData = await fs.readFile(certFile, 'utf8');
      const certObj = crypto.X509Certificate.createFromPem(certData);
      this.expiration = new Date(certObj.validTo).toISOString();

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
          return { type: 2, value: hostname };
        }
        return { type: 7, value: hostname };
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
   * Ensure certificates exist and are valid for the given hostnames
   * @param {string[]} hostnames - List of hostnames to include in certificate
   */
  async ensureCertificates(hostnames) {
    const existingValid = await this._areCertificatesValid(hostnames);
    const hostnamesChanged = this._lastHostnames && 
      JSON.stringify(this._lastHostnames.sort()) !== JSON.stringify(hostnames.sort());

    if (!existingValid) {
      const mkcertAvailable = await this.checkMkcert();
      
      if (mkcertAvailable) {
        try {
          await this._generateWithMkcert(hostnames);
        } catch (error) {
          console.warn(`mkcert failed, falling back to self-signed: ${error.message}`);
          if (!this.selfSignedFallback) {
            throw error;
          }
          await this._generateSelfSigned(hostnames);
        }
      } else if (this.selfSignedFallback) {
        await this._generateSelfSigned(hostnames);
      } else {
        throw new Error('mkcert is not available and self-signed fallback is disabled');
      }
    } else if (hostnamesChanged) {
      const mkcertAvailable = await this.checkMkcert();
      
      if (mkcertAvailable) {
        try {
          await this._generateWithMkcert(hostnames);
        } catch (error) {
          console.warn(`mkcert failed during regeneration: ${error.message}`);
          if (!this.selfSignedFallback) {
            throw error;
          }
          await this._generateSelfSigned(hostnames);
        }
      } else if (this.selfSignedFallback) {
        await this._generateSelfSigned(hostnames);
      }
    }

    this._lastHostnames = hostnames;
    return true;
  }

  /**
   * Get information about the current certificate
   * @returns {Object} Certificate info
   */
  getCertificateInfo() {
    return {
      mode: this.mode,
      certPath: this.certPath,
      keyPath: this.keyPath,
      expiration: this.expiration,
      certDir: this.certDir
    };
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
