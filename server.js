import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";
import { initDB, upsertProject, getProject } from "./db.js";
import { makeBrandRolloutPDF } from "./pdf.js";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 8080;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const STATIC_DIR = path.resolve("static");
if (!fs.existsSync(STATIC_DIR)) fs.mkdirSync(STATIC_DIR, { recursive: true });

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.use(morgan("tiny"));
app.use(rateLimit({ windowMs: 60000, max: 120 }));
app.use("/static", express.static(STATIC_DIR));

const db = initDB(process.env.DATABASE_URL || "./hitlab.db");

app.get("/health", (_,res)=>res.json({ok:true,ts:Date.now()}));

app.post("/project",(req,res)=>{
  const {action,title,projectId,data={}}=req.body||{};
  if(!action)return res.status(400).json({ok:false,error:"action required"});
  if(action==="save"){
    const id=`proj_${randomUUID()}`;
    upsertProject(db,id,title||"Untitled",{...data});
    return res.json({ok:true,projectId:id,url:`${BASE_URL}/project/${id}`});
  }
  if(action==="open"&&projectId){
    const pr=getProject(db,projectId);
    if(!pr)return res.status(404).json({ok:false,error:"not found"});
    return res.json({ok:true,project:pr});
  }
  res.status(400).json({ok:false,error:"invalid action"});
});

app.post("/brand/rollout",async(req,res)=>{
  try{
    const {artist,track,goals=[],audience}=req.body||{};
    if(!artist||!track?.title)return res.status(400).json({ok:false,error:"artist and track.title required"});
    const file=await makeBrandRolloutPDF({outDir:STATIC_DIR,artist,track,goals,audience});
    res.json({ok:true,pdfUrl:`${BASE_URL}/static/${path.basename(file)}`});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});

app.listen(PORT,()=>console.log(`HitLab API running on ${BASE_URL}`));
