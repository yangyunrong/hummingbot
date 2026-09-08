import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {encryptCredential,decryptCredential} from './vault.js';

export class CredentialStore{
  constructor({masterKeyFile='/etc/dkivn-v49/master.key',credentialFile='/etc/dkivn-v49/credentials.enc'}={}){Object.assign(this,{masterKeyFile,credentialFile});}
  ensureMasterKey(){fs.mkdirSync(path.dirname(this.masterKeyFile),{recursive:true,mode:0o750});if(!fs.existsSync(this.masterKeyFile)){fs.writeFileSync(this.masterKeyFile,crypto.randomBytes(32),{mode:0o640});}const key=fs.readFileSync(this.masterKeyFile);if(key.length!==32)throw new Error('MASTER_KEY_LENGTH');return key;}
  exists(){return fs.existsSync(this.credentialFile);}
  save(credential){const key=this.ensureMasterKey(),env=encryptCredential(key,credential);fs.mkdirSync(path.dirname(this.credentialFile),{recursive:true,mode:0o750});const tmp=`${this.credentialFile}.tmp`;fs.writeFileSync(tmp,JSON.stringify(env),{mode:0o640});fs.renameSync(tmp,this.credentialFile);return{maskedKey:`••••${String(credential.apiKey).slice(-4)}`};}
  load(){if(!this.exists())return null;const key=this.ensureMasterKey(),env=JSON.parse(fs.readFileSync(this.credentialFile,'utf8'));return decryptCredential(key,env);}
  status(){const c=this.load();return c?{bound:true,maskedKey:`••••${String(c.apiKey).slice(-4)}`,tradeStatus:String(c.tradeStatus||'DECLARED_UNVERIFIED')}:{bound:false,maskedKey:null,tradeStatus:'UNKNOWN'};}
  markTradeVerified(){const c=this.load();if(!c)return false;c.tradeStatus='VERIFIED';c.verifiedAt=new Date().toISOString();this.save(c);return true;}
  delete(){try{fs.unlinkSync(this.credentialFile);}catch(e){if(e?.code!=='ENOENT')throw e;}return true;}
}
