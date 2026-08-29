
const CLOUD_CFG_KEY="kaji-cloud-config-v1";
const CLOUD_POLL_MS=4000;
let cloudClient=null,cloudChannel=null;
function loadCloudConfig(){try{return JSON.parse(localStorage.getItem(CLOUD_CFG_KEY)||"null")}catch(e){return null}}
function cloudReady(){const c=loadCloudConfig();return !!(c&&c.url&&c.anonKey&&c.householdId)}
async function initCloud(){const c=loadCloudConfig();if(!c||!window.supabase)return false;cloudClient=window.supabase.createClient(c.url,c.anonKey);return true}
async function fetchCloudData(){
 if(!cloudClient&&!(await initCloud()))return null;const c=loadCloudConfig();
 const [a,b,d]=await Promise.all([
  cloudClient.from("chores").select("*").eq("household_id",c.householdId),
  cloudClient.from("records").select("*").eq("household_id",c.householdId),
  cloudClient.from("household_settings").select("*").eq("household_id",c.householdId)
 ]);
 if(a.error||b.error||d.error){console.error(a.error,b.error,d.error);return null}
 return {chores:a.data||[],records:b.data||[],settings:d.data||[]}
}
function applyCloudData(data){
 chores=data.chores.map(x=>({id:x.item_id,name:x.name,amount:Number(x.amount)}));
 records=data.records.map(x=>({id:x.item_id,date:x.date,person:Number(x.person_index),choreId:x.chore_id||"",choreName:x.chore_name,amount:Number(x.amount)}));
 const nr=(data.settings||[]).find(x=>x.setting_key==="names");if(nr&&Array.isArray(nr.setting_value))names=nr.setting_value;
 localStorage.setItem(CK,JSON.stringify(chores));localStorage.setItem(RK,JSON.stringify(records));localStorage.setItem(NK,JSON.stringify(names))
}
async function pushAllLocal(){
 if(!cloudClient&&!(await initCloud()))return false;const c=loadCloudConfig();
 if(chores.length){const {error}=await cloudClient.from("chores").upsert(chores.map(x=>({household_id:c.householdId,item_id:x.id,name:x.name,amount:Number(x.amount)})),{onConflict:"household_id,item_id"});if(error)return false}
 if(records.length){const {error}=await cloudClient.from("records").upsert(records.map(x=>({household_id:c.householdId,item_id:x.id,date:x.date,person_index:Number(x.person),chore_id:x.choreId||"",chore_name:x.choreName,amount:Number(x.amount)})),{onConflict:"household_id,item_id"});if(error)return false}
 const {error}=await cloudClient.from("household_settings").upsert({household_id:c.householdId,setting_key:"names",setting_value:names},{onConflict:"household_id,setting_key"});return !error
}
async function bootstrapCloud(){
 const data=await fetchCloudData();if(!data)return false;
 const empty=data.chores.length===0&&data.records.length===0&&!data.settings.some(x=>x.setting_key==="names");
 if(empty){if(!(await pushAllLocal()))return false;const again=await fetchCloudData();if(again)applyCloudData(again);return true}
 applyCloudData(data);return true
}
async function pullCloudData(){const data=await fetchCloudData();if(!data)return false;applyCloudData(data);return true}
async function upsertRecord(r){if(!cloudReady())return true;if(!cloudClient&&!(await initCloud()))return false;const c=loadCloudConfig();const {error}=await cloudClient.from("records").upsert({household_id:c.householdId,item_id:r.id,date:r.date,person_index:Number(r.person),chore_id:r.choreId||"",chore_name:r.choreName,amount:Number(r.amount)},{onConflict:"household_id,item_id"});return !error}
async function deleteRecordCloud(id){if(!cloudReady())return true;if(!cloudClient&&!(await initCloud()))return false;const c=loadCloudConfig();const {error}=await cloudClient.from("records").delete().eq("household_id",c.householdId).eq("item_id",id);return !error}
async function resetRecordsCloud(){if(!cloudReady())return true;if(!cloudClient&&!(await initCloud()))return false;const c=loadCloudConfig();const {error}=await cloudClient.from("records").delete().eq("household_id",c.householdId);return !error}
async function upsertChore(ch){if(!cloudReady())return true;if(!cloudClient&&!(await initCloud()))return false;const c=loadCloudConfig();const {error}=await cloudClient.from("chores").upsert({household_id:c.householdId,item_id:ch.id,name:ch.name,amount:Number(ch.amount)},{onConflict:"household_id,item_id"});return !error}
async function deleteChoreCloud(id){if(!cloudReady())return true;if(!cloudClient&&!(await initCloud()))return false;const c=loadCloudConfig();const {error}=await cloudClient.from("chores").delete().eq("household_id",c.householdId).eq("item_id",id);return !error}
async function pushNames(){if(!cloudReady())return true;if(!cloudClient&&!(await initCloud()))return false;const c=loadCloudConfig();const {error}=await cloudClient.from("household_settings").upsert({household_id:c.householdId,setting_key:"names",setting_value:names},{onConflict:"household_id,setting_key"});return !error}
function startCloudRealtime(onChange){if(!cloudReady())return;initCloud().then(()=>{const c=loadCloudConfig();cloudChannel=cloudClient.channel("kaji-"+c.householdId).on("postgres_changes",{event:"*",schema:"public",table:"records",filter:"household_id=eq."+c.householdId},async()=>{if(await pullCloudData())onChange&&onChange()}).on("postgres_changes",{event:"*",schema:"public",table:"chores",filter:"household_id=eq."+c.householdId},async()=>{if(await pullCloudData())onChange&&onChange()}).on("postgres_changes",{event:"*",schema:"public",table:"household_settings",filter:"household_id=eq."+c.householdId},async()=>{if(await pullCloudData())onChange&&onChange()}).subscribe()})}
