
const CLOUD_CFG_KEY="kaji-cloud-config-v1";
const CLOUD_POLL_MS=5000;
let cloudClient=null;
let cloudChannel=null;

function loadCloudConfig(){
  try{return JSON.parse(localStorage.getItem(CLOUD_CFG_KEY)||"null")}catch(e){return null}
}
function cloudReady(){
  const c=loadCloudConfig();
  return !!(c && c.url && c.anonKey && c.householdId);
}
async function initCloud(){
  const c=loadCloudConfig();
  if(!c || !c.url || !c.anonKey || !c.householdId || !window.supabase) return false;
  cloudClient=window.supabase.createClient(c.url,c.anonKey);
  return true;
}
async function pullCloudData(){
  if(!cloudClient && !(await initCloud())) return false;
  const c=loadCloudConfig();
  const [ch, rec, st] = await Promise.all([
    cloudClient.from("chores").select("*").eq("household_id",c.householdId).order("created_at",{ascending:true}),
    cloudClient.from("records").select("*").eq("household_id",c.householdId).order("date",{ascending:true}).order("created_at",{ascending:true}),
    cloudClient.from("household_settings").select("*").eq("household_id",c.householdId)
  ]);
  if(ch.error||rec.error||st.error){
    console.error("cloud pull error",ch.error,rec.error,st.error);
    return false;
  }
  if(ch.data) {
    chores=ch.data.map(x=>({id:x.item_id,name:x.name,amount:Number(x.amount)}));
    localStorage.setItem(CK,JSON.stringify(chores));
  }
  if(rec.data) {
    records=rec.data.map(x=>({
      id:x.item_id,date:x.date,person:Number(x.person_index),
      choreId:x.chore_id,choreName:x.chore_name,amount:Number(x.amount)
    }));
    localStorage.setItem(RK,JSON.stringify(records));
  }
  const nameRow=(st.data||[]).find(x=>x.setting_key==="names");
  if(nameRow && Array.isArray(nameRow.setting_value)){
    names=nameRow.setting_value;
    localStorage.setItem(NK,JSON.stringify(names));
  }
  return true;
}
async function pushChores(){
  if(!cloudClient && !(await initCloud())) return false;
  const c=loadCloudConfig();
  await cloudClient.from("chores").delete().eq("household_id",c.householdId);
  if(!chores.length) return true;
  const rows=chores.map(x=>({
    household_id:c.householdId,item_id:x.id,name:x.name,amount:Number(x.amount)
  }));
  const {error}=await cloudClient.from("chores").insert(rows);
  if(error){console.error(error);return false}
  return true;
}
async function pushRecords(){
  if(!cloudClient && !(await initCloud())) return false;
  const c=loadCloudConfig();
  await cloudClient.from("records").delete().eq("household_id",c.householdId);
  if(!records.length) return true;
  const rows=records.map(x=>({
    household_id:c.householdId,item_id:x.id,date:x.date,person_index:Number(x.person),
    chore_id:x.choreId||"",chore_name:x.choreName,amount:Number(x.amount)
  }));
  const {error}=await cloudClient.from("records").insert(rows);
  if(error){console.error(error);return false}
  return true;
}
async function pushNames(){
  if(!cloudClient && !(await initCloud())) return false;
  const c=loadCloudConfig();
  const {error}=await cloudClient.from("household_settings").upsert({
    household_id:c.householdId,setting_key:"names",setting_value:names
  },{onConflict:"household_id,setting_key"});
  if(error){console.error(error);return false}
  return true;
}
function startCloudRealtime(onChange){
  if(!cloudReady()) return;
  initCloud().then(()=>{
    if(!cloudClient) return;
    const c=loadCloudConfig();
    if(cloudChannel) cloudClient.removeChannel(cloudChannel);
    cloudChannel=cloudClient.channel("kaji-"+c.householdId)
      .on("postgres_changes",{event:"*",schema:"public",table:"chores",filter:"household_id=eq."+c.householdId},async()=>{await pullCloudData();onChange&&onChange()})
      .on("postgres_changes",{event:"*",schema:"public",table:"records",filter:"household_id=eq."+c.householdId},async()=>{await pullCloudData();onChange&&onChange()})
      .on("postgres_changes",{event:"*",schema:"public",table:"household_settings",filter:"household_id=eq."+c.householdId},async()=>{await pullCloudData();onChange&&onChange()})
      .subscribe();
  });
}
