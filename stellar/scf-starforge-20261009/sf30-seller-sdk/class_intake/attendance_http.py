"""Attendance routes called inside the existing authenticated loopback handler."""
import json
from attendance import Attendance
from class_intake import atomic,sha
ASSETS={"/attendance":"attendance.html","/attendance.js":"attendance.js","/attendance.css":"attendance.css"}
def get(workspace,path,query):
 model=Attendance(workspace)
 if path=="/api/attendance/state":return model.state()
 if path=="/api/attendance/view":return model.view(query["id"],int(query["revision"]) if "revision" in query else None)
 if path=="/api/attendance/history":return model.history(query["id"])
 if path=="/api/attendance/request":return model.request(query["id"])
 raise ValueError("Unknown attendance route")
def post(workspace,path,body):
 model=Attendance(workspace)
 if path=="/api/attendance/receive":return model.receive(body)
 data=json.loads(body)
 if path=="/api/attendance/save":return model.save(data)
 if path=="/api/attendance/export":
  raw=model.export(data["id"],data.get("revision"));digest=sha(raw);atomic(workspace.root/"exports"/digest,raw)
  return {"filename":"Class_Attendance_Complete.zip","bytes":len(raw),"sha256":digest,"url":"/download/"+digest}
 raise ValueError("Unknown attendance route")
