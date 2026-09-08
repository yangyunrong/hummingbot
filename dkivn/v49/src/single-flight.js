export class SingleFlightRunner{
  constructor(run){if(typeof run!=='function')throw new Error('RUNNER_FUNCTION_REQUIRED');this.run=run;this.pending=false;this.current=null;this.runCount=0;}
  trigger(){this.pending=true;if(!this.current)this.current=this.#drain();return this.current;}
  async #drain(){try{while(this.pending){this.pending=false;this.runCount++;await this.run();}}finally{this.current=null;}return this.runCount;}
  get inFlight(){return this.current!==null;}
}
