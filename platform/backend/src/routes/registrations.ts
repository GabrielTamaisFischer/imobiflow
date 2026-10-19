import { Router } from "express";
import { z } from "zod";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
  requireRole,
} from "../middleware/auth.js";
import { getWebsiteBuilderPrisma } from "../lib/website-builder-prisma.js";
import { resolveOrCreateBuyerIdentity } from "../services/buyer-registration.js";
import { resolveOrCreateTenantIdentity } from "../services/tenant-registration.js";
import { resolveOrCreateBrokerIdentity } from "../services/broker-registration.js";
import { isValidBrazilianDocument, normalizeBrazilianDocument } from "../services/brazilian-document.js";
import { hashPassword, normalizeEmail } from "../services/mysql-auth.js";
import { buildStorageFolder, getStorageProvider } from "../services/storage/index.js";
import { validateUploadFile } from "../services/storage/file-policy.js";
import { createStoredFileRecord } from "../services/storage/stored-files.js";
import type { RequestWithAccess } from "../types/access.js";

export const registrationsRouter = Router();
registrationsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const addressSchema = z.object({
  zip_code: z.string().max(16).optional().or(z.literal("")),
  street: z.string().max(180).optional().or(z.literal("")),
  number: z.string().max(40).optional().or(z.literal("")),
  complement: z.string().max(120).optional().or(z.literal("")),
  neighborhood: z.string().max(120).optional().or(z.literal("")),
  city: z.string().max(120).optional().or(z.literal("")),
  state: z.string().max(40).optional().or(z.literal("")),
  country: z.string().max(80).optional().or(z.literal("")),
  ddd: z.string().max(8).optional().or(z.literal("")),
}).optional();

const baseSchema = z.object({
  name: z.string().trim().min(2).max(180),
  party_type: z.enum(["individual", "company"]).default("individual"),
  document: z.string().trim().max(40).optional().or(z.literal("")),
  rg: z.string().trim().max(40).optional().or(z.literal("")),
  nationality: z.string().trim().max(80).optional().or(z.literal("")),
  occupation: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email().max(180).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(40).optional().or(z.literal("")),
  address_json: addressSchema,
});

const buyerSchema = baseSchema;
const tenantSchema = baseSchema;
const brokerSchema = baseSchema.extend({
  creci_number: z.string().trim().max(40).optional().or(z.literal("")),
  job_title: z.string().trim().max(120).optional().or(z.literal("")),
  bio_text: z.string().trim().max(4000).optional().or(z.literal("")),
  access_email: z.string().trim().email().max(180).optional().or(z.literal("")),
  access_password: z.string().min(12).max(128).optional().or(z.literal("")),
});

const photoSchema = z.object({
  file_name: z.string().min(1).max(180),
  mime_type: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
  size_bytes: z.number().int().positive().max(5 * 1024 * 1024),
  content_base64: z.string().min(1),
});

const clean = (v?: string) => v?.trim() || null;
function validateDocument(document: string | undefined, partyType: "individual" | "company") {
  const value = clean(document);
  if (value && !isValidBrazilianDocument(value, partyType)) {
    throw Object.assign(new Error("CPF/CNPJ inválido."), { statusCode: 422, code: "INVALID_REGISTRATION_DOCUMENT" });
  }
}
function serializeParty(p: any) {
  return { id:p.id, company_id:p.companyId, party_type:p.partyType, name:p.name, document:p.taxId, document_normalized:p.taxIdNormalized, rg:p.rg, nationality:p.nationality, occupation:p.occupation, email:p.email, phone:p.phone, whatsapp:p.whatsapp, address_json:p.addressJson ?? {}, status:p.status, created_at:p.createdAt.toISOString(), updated_at:p.updatedAt.toISOString() };
}
function serializeRegistration(row:any){
  const profile=row.buyerProfile??row.tenantProfile??row.brokerProfile??null;
  return { id:row.id, role:row.role, status:row.status, party:serializeParty(row.party), profile: profile ? {
    id:profile.id,
    ...(row.role==="buyer"?{interest_json:profile.interestJson??{},financial_json:profile.financialJson??{}}:row.role==="tenant"?{rental_json:profile.rentalJson??{},guarantor_json:profile.guarantorJson??{}}:{creci_number:profile.creciNumber??null,job_title:profile.jobTitle??null,photo_url:profile.photoUrl??null,bio_text:profile.bioText??null}),
    created_at:profile.createdAt.toISOString(), updated_at:profile.updatedAt.toISOString()
  }:null, linked_users:(row.party.appUsers??[]).map((u:any)=>({id:u.id,name:u.name,email:u.email,phone:u.phone,status:u.status,role:u.role})) };
}
const includeRegistration={party:{include:{appUsers:{select:{id:true,name:true,email:true,phone:true,status:true,role:true}}}},buyerProfile:true,tenantProfile:true,brokerProfile:true} as const;
async function listRole(companyId:string, role:"buyer"|"tenant"|"broker"){
 return getWebsiteBuilderPrisma().partyRole.findMany({where:{companyId,role,status:"active",party:{status:"active"}},orderBy:[{party:{name:"asc"}},{createdAt:"asc"}],include:includeRegistration});
}
function commonInput(input:any){
 return {name:input.name,document:clean(input.document),partyType:input.party_type,rg:clean(input.rg),nationality:clean(input.nationality),occupation:clean(input.occupation),email:clean(input.email),phone:clean(input.phone),whatsapp:clean(input.whatsapp),addressJson:input.address_json ?? undefined};
}

registrationsRouter.get("/lookup/document", async (req:RequestWithAccess,res,next)=>{
 try{
  const document=String(req.query.document??"").trim(); const digits=normalizeBrazilianDocument(document);
  if(!digits) return res.status(400).json({error:"INVALID_DOCUMENT",message:"Informe CPF ou CNPJ."});
  if(digits.length===11){
    const party=await getWebsiteBuilderPrisma().party.findFirst({where:{companyId:req.access!.company.id,taxIdNormalized:digits}});
    return res.json({type:"cpf",source:party?"tenant":"none",found:Boolean(party),party:party?serializeParty(party):null});
  }
  if(digits.length!==14) return res.status(400).json({error:"INVALID_DOCUMENT",message:"CPF/CNPJ inválido."});
  const response=await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`,{headers:{Accept:"application/json"}});
  if(!response.ok) return res.status(response.status===404?404:502).json({error:"CNPJ_LOOKUP_FAILED",message:response.status===404?"CNPJ não encontrado.":"Não foi possível consultar o CNPJ agora."});
  const data:any=await response.json();
  res.json({type:"cnpj",source:"brasilapi",found:true,company:{name:data.razao_social||data.nome_fantasia||"",email:data.email||"",phone:data.ddd_telefone_1||"",address:{zip_code:data.cep||"",street:data.logradouro||"",number:data.numero||"",complement:data.complemento||"",neighborhood:data.bairro||"",city:data.municipio||"",state:data.uf||"",country:"Brasil"}}});
 }catch(e){next(e);}
});

registrationsRouter.get("/lookup/cep", async (req:RequestWithAccess,res,next)=>{
 try{
  const cep=String(req.query.cep??"").replace(/\D/g,""); if(cep.length!==8) return res.status(400).json({error:"INVALID_CEP",message:"CEP deve conter 8 dígitos."});
  const response=await fetch(`https://viacep.com.br/ws/${cep}/json/`,{headers:{Accept:"application/json"}});
  if(!response.ok) return res.status(502).json({error:"CEP_LOOKUP_FAILED",message:"Não foi possível consultar o CEP agora."});
  const data:any=await response.json(); if(data.erro) return res.status(404).json({error:"CEP_NOT_FOUND",message:"CEP não encontrado."});
  res.json({address:{zip_code:data.cep||cep,street:data.logradouro||"",neighborhood:data.bairro||"",city:data.localidade||"",state:data.uf||"",country:"Brasil",ddd:data.ddd||""}});
 }catch(e){next(e);}
});

registrationsRouter.get("/buyers",requirePermission("crm.view"),async(req:RequestWithAccess,res,next)=>{try{res.json({registrations:(await listRole(req.access!.company.id,"buyer")).map(serializeRegistration)});}catch(e){next(e);}});
registrationsRouter.post("/buyers",requirePermission("crm.manage"),async(req:RequestWithAccess,res,next)=>{try{const input=buyerSchema.parse(req.body);validateDocument(input.document,input.party_type);const result=await resolveOrCreateBuyerIdentity(req.access!.company.id,req.access!.appUser.id,commonInput(input));const exact=await getWebsiteBuilderPrisma().partyRole.findFirst({where:{id:result.partyRole.id,companyId:req.access!.company.id},include:includeRegistration});res.status(result.created.partyRole||result.created.buyerProfile?201:200).json({registration:serializeRegistration(exact)});}catch(e){next(e);}});
registrationsRouter.get("/tenants",requirePermission("contracts.view"),async(req:RequestWithAccess,res,next)=>{try{res.json({registrations:(await listRole(req.access!.company.id,"tenant")).map(serializeRegistration)});}catch(e){next(e);}});
registrationsRouter.post("/tenants",requirePermission("contracts.manage"),async(req:RequestWithAccess,res,next)=>{try{const input=tenantSchema.parse(req.body);validateDocument(input.document,input.party_type);const result=await resolveOrCreateTenantIdentity(req.access!.company.id,req.access!.appUser.id,commonInput(input));const exact=await getWebsiteBuilderPrisma().partyRole.findFirst({where:{id:result.partyRole.id,companyId:req.access!.company.id},include:includeRegistration});res.status(result.created.partyRole||result.created.tenantProfile?201:200).json({registration:serializeRegistration(exact)});}catch(e){next(e);}});
registrationsRouter.get("/brokers",requirePermission("users.manage"),async(req:RequestWithAccess,res,next)=>{try{res.json({registrations:(await listRole(req.access!.company.id,"broker")).map(serializeRegistration)});}catch(e){next(e);}});
registrationsRouter.post("/brokers",requirePermission("users.manage"),requireRole("owner","admin"),async(req:RequestWithAccess,res,next)=>{
 try{
  const input=brokerSchema.parse(req.body); validateDocument(input.document,input.party_type);
  if(Boolean(clean(input.access_email))!==Boolean(clean(input.access_password))) throw Object.assign(new Error("Informe e-mail corporativo e senha de acesso juntos."),{statusCode:400,code:"BROKER_ACCESS_INCOMPLETE"});
  const prisma=getWebsiteBuilderPrisma();
  const result=await prisma.$transaction(async tx=>{
    const identity=await resolveOrCreateBrokerIdentity(req.access!.company.id,req.access!.appUser.id,{...commonInput(input),creciNumber:clean(input.creci_number),jobTitle:clean(input.job_title),bioText:clean(input.bio_text)},tx);
    if(clean(input.access_email)){
      const email=normalizeEmail(input.access_email!);
      const exists=await tx.appUser.findUnique({where:{email}});
      if(exists && exists.partyId!==identity.party.id) throw Object.assign(new Error("Este e-mail de acesso já pertence a outro usuário."),{statusCode:409,code:"USER_ALREADY_EXISTS"});
      if(!exists){
        const brokerRole=await tx.role.findFirst({where:{companyId:req.access!.company.id,systemKey:"broker"}});
        if(!brokerRole) throw Object.assign(new Error("Papel broker não configurado."),{statusCode:400,code:"BROKER_ROLE_NOT_FOUND"});
        await tx.appUser.create({data:{companyId:req.access!.company.id,roleId:brokerRole.id,partyId:identity.party.id,name:identity.party.name,email,passwordHash:await hashPassword(input.access_password!),phone:clean(input.phone),status:"active",role:"broker",permissionsJson:[]}});
      }
    }
    return identity;
  },{timeout:15000});
  const exact=await prisma.partyRole.findFirst({where:{id:result.partyRole.id,companyId:req.access!.company.id},include:includeRegistration});
  res.status(result.created.partyRole||result.created.brokerProfile?201:200).json({registration:serializeRegistration(exact)});
 }catch(e){next(e);}
});

registrationsRouter.post("/brokers/:roleId/photo",requirePermission("users.manage"),requireRole("owner","admin"),async(req:RequestWithAccess,res,next)=>{
 try{
  const input=photoSchema.parse(req.body); const companyId=req.access!.company.id; const prisma=getWebsiteBuilderPrisma();
  const role=await prisma.partyRole.findFirst({where:{id:String(req.params.roleId),companyId,role:"broker"},include:{brokerProfile:true}});
  if(!role?.brokerProfile) return res.status(404).json({error:"BROKER_NOT_FOUND",message:"Corretor não encontrado."});
  const body=Buffer.from(input.content_base64.includes(",")?input.content_base64.split(",").at(-1)!:input.content_base64,"base64");
  const policy=validateUploadFile({purpose:"profile_photo",fileName:input.file_name,mimeType:input.mime_type,declaredSizeBytes:input.size_bytes,body});
  const uploaded=await getStorageProvider().uploadFile({companyId,entityType:"broker_profile",entityId:role.brokerProfile.id,purpose:"profile_photo",fileName:input.file_name,mimeType:policy.normalizedMimeType,sizeBytes:policy.measuredSizeBytes,body,folder:buildStorageFolder({companyId,purpose:"profile_photo"})});
  await createStoredFileRecord({companyId,entityType:"broker_profile",entityId:role.brokerProfile.id,file:uploaded,uploadedBy:req.access!.appUser.id,purpose:"profile_photo"});
  const profile=await prisma.brokerProfile.update({where:{id:role.brokerProfile.id},data:{photoUrl:uploaded.secureUrl}});
  res.status(201).json({photo_url:profile.photoUrl});
 }catch(e){next(e);}
});
