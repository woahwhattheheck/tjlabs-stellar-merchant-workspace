/** Whole attendance requests through the original ClassIntakeClient connection. */
export class AttendanceClient {
 constructor(intakeClient){if(!intakeClient?.call)throw new TypeError("An original ClassIntakeClient is required");this.intake=intakeClient}
 state(){return this.intake.call("/api/attendance/state")}
 view(id,revision){return this.intake.call("/api/attendance/view?id="+encodeURIComponent(id)+(revision==null?"":"&revision="+revision))}
 history(id){return this.intake.call("/api/attendance/history?id="+encodeURIComponent(id))}
 request(id){return this.intake.call("/api/attendance/request?id="+encodeURIComponent(id))}
 save(request){return this.intake.call("/api/attendance/save",request)}
 export(id,revision){return this.intake.call("/api/attendance/export",{id,revision})}
 async receive(file){
  if(!this.intake.token)await this.intake.state();
  const response=await this.intake.fetch(this.intake.baseUrl+"/api/attendance/receive",{method:"POST",headers:{"X-Intake-Token":this.intake.token},body:file});
  const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error??"Attendance receiving failed"),{status:response.status,body:value});return value;
 }
}
