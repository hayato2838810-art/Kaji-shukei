
(function(){
  const CK="kaji-chores-v4", RK="kaji-records-v4", NK="kaji-names-v4", CFG="kaji-cloud-config-v1";
  const POLL=3000;
  let client=null, channel=null, timer=null, listeners=[];
  let state={chores:[],records:[],names:["自分","パートナー"]};
  let lastError="";

  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2);
  const parse=(k,f)=>{try{const v=localStorage.getItem(k);return v===null?f:JSON.parse(v)}catch(e){return f}};
  const saveLocal=()=>{
    localStorage.setItem(CK,JSON.stringify(state.chores));
    localStorage.setItem(RK,JSON.stringify(state.records));
    localStorage.setItem(NK,JSON.stringify(state.names));
  };
  const loadLocal=()=>{
    state.chores=parse(CK,null)||[
      {id:uid(),name:"皿洗い",amount:100},
      {id:uid(),name:"洗濯",amount:150},
      {id:uid(),name:"掃除",amount:200},
      {id:uid(),name:"料理",amount:300}
    ];
    state.records=parse(RK,[]);
    state.names=parse(NK,["自分","パートナー"]);
    saveLocal();
  };
  const emit=()=>listeners.forEach(fn=>{try{fn(snapshot())}catch(e){console.error(e)}});
  const snapshot=()=>JSON.parse(JSON.stringify(state));
  const cfg=()=>parse(CFG,null);
  const configured=()=>{const c=cfg();return !!(c&&c.url&&c.anonKey&&c.householdId)};
  const initClient=async()=>{
    if(!configured()||!window.supabase)return false;
    if(!client){const c=cfg();client=window.supabase.createClient(c.url,c.anonKey)}
    return true;
  };
  const fail=(e)=>{lastError=e?.message||String(e||"不明なエラー");console.error(e);return false};

  async function fetchCloud(){
    if(!(await initClient()))return null;
    const c=cfg();
    const [a,b,d]=await Promise.all([
      client.from("chores").select("*").eq("household_id",c.householdId),
      client.from("records").select("*").eq("household_id",c.householdId),
      client.from("household_settings").select("*").eq("household_id",c.householdId)
    ]);
    if(a.error||b.error||d.error){fail(a.error||b.error||d.error);return null}
    lastError="";
    return {chores:a.data||[],records:b.data||[],settings:d.data||[]};
  }

  function applyCloud(data){
    state.chores=(data.chores||[]).map(x=>({id:x.item_id,name:x.name,amount:Number(x.amount)}));
    state.records=(data.records||[]).map(x=>({
      id:x.item_id,date:x.date,person:Number(x.person_index),choreId:x.chore_id||"",
      choreName:x.chore_name,amount:Number(x.amount)
    }));
    const n=(data.settings||[]).find(x=>x.setting_key==="names");
    if(n&&Array.isArray(n.setting_value))state.names=n.setting_value;
    saveLocal();emit();
  }

  async function uploadMissingLocal(cloud){
    const c=cfg();
    if(cloud.chores.length===0 && state.chores.length){
      const {error}=await client.from("chores").upsert(
        state.chores.map(x=>({household_id:c.householdId,item_id:x.id,name:x.name,amount:Number(x.amount)})),
        {onConflict:"household_id,item_id"});
      if(error)return fail(error);
    }
    if(cloud.records.length===0 && state.records.length){
      const {error}=await client.from("records").upsert(
        state.records.map(x=>({household_id:c.householdId,item_id:x.id,date:x.date,person_index:Number(x.person),
          chore_id:x.choreId||"",chore_name:x.choreName,amount:Number(x.amount)})),
        {onConflict:"household_id,item_id"});
      if(error)return fail(error);
    }
    if(!cloud.settings.some(x=>x.setting_key==="names")){
      const {error}=await client.from("household_settings").upsert(
        {household_id:c.householdId,setting_key:"names",setting_value:state.names},
        {onConflict:"household_id,setting_key"});
      if(error)return fail(error);
    }
    return true;
  }

  async function syncInitial(){
    if(!configured())return true;
    if(!(await initClient()))return false;
    let cloud=await fetchCloud(); if(!cloud)return false;
    if(!(await uploadMissingLocal(cloud)))return false;
    cloud=await fetchCloud(); if(!cloud)return false;
    applyCloud(cloud);
    return true;
  }

  async function pull(){
    if(!configured())return true;
    const cloud=await fetchCloud();if(!cloud)return false;
    applyCloud(cloud);return true;
  }

  async function writeRecord(r){
    if(!configured())return true;
    if(!(await initClient()))return false;const c=cfg();
    const {error}=await client.from("records").upsert(
      {household_id:c.householdId,item_id:r.id,date:r.date,person_index:Number(r.person),
       chore_id:r.choreId||"",chore_name:r.choreName,amount:Number(r.amount)},
      {onConflict:"household_id,item_id"});
    return error?fail(error):true;
  }
  async function deleteRecordCloud(id){
    if(!configured())return true;
    if(!(await initClient()))return false;const c=cfg();
    const {error}=await client.from("records").delete().eq("household_id",c.householdId).eq("item_id",id);
    return error?fail(error):true;
  }
  async function writeChore(x){
    if(!configured())return true;
    if(!(await initClient()))return false;const c=cfg();
    const {error}=await client.from("chores").upsert(
      {household_id:c.householdId,item_id:x.id,name:x.name,amount:Number(x.amount)},
      {onConflict:"household_id,item_id"});
    return error?fail(error):true;
  }
  async function deleteChoreCloud(id){
    if(!configured())return true;
    if(!(await initClient()))return false;const c=cfg();
    const {error}=await client.from("chores").delete().eq("household_id",c.householdId).eq("item_id",id);
    return error?fail(error):true;
  }
  async function writeNames(){
    if(!configured())return true;
    if(!(await initClient()))return false;const c=cfg();
    const {error}=await client.from("household_settings").upsert(
      {household_id:c.householdId,setting_key:"names",setting_value:state.names},
      {onConflict:"household_id,setting_key"});
    return error?fail(error):true;
  }

  async function startAuto(){
    if(!configured())return;
    await initClient();
    const c=cfg();
    if(channel)client.removeChannel(channel);
    channel=client.channel("kaji-"+c.householdId)
      .on("postgres_changes",{event:"*",schema:"public",table:"records",filter:"household_id=eq."+c.householdId},pull)
      .on("postgres_changes",{event:"*",schema:"public",table:"chores",filter:"household_id=eq."+c.householdId},pull)
      .on("postgres_changes",{event:"*",schema:"public",table:"household_settings",filter:"household_id=eq."+c.householdId},pull)
      .subscribe();
    if(timer)clearInterval(timer);
    timer=setInterval(pull,POLL);
  }

  async function init(){
    loadLocal();
    if(configured()){
      await syncInitial();
      await startAuto();
    }
    emit();
    return snapshot();
  }

  async function addRecord({date,person,choreId}){
    const ch=state.chores.find(x=>x.id===choreId);if(!ch)throw new Error("家事が見つかりません");
    const r={id:uid(),date,person:Number(person),choreId:ch.id,choreName:ch.name,amount:Number(ch.amount)};
    state.records.push(r);saveLocal();emit();
    if(!(await writeRecord(r)))throw new Error(lastError||"クラウド保存に失敗しました");
    return r;
  }
  async function removeRecord(id){
    state.records=state.records.filter(x=>x.id!==id);saveLocal();emit();
    if(!(await deleteRecordCloud(id)))throw new Error(lastError||"クラウド削除に失敗しました");
  }
  async function resetRecords(){
    state.records=[];saveLocal();emit();
    if(configured()){
      if(!(await initClient()))throw new Error("Supabase初期化失敗");
      const c=cfg();const {error}=await client.from("records").delete().eq("household_id",c.householdId);
      if(error)throw new Error(error.message);
    }
  }
  async function addChore(name,amount){
    const ch={id:uid(),name,amount:Number(amount)};state.chores.push(ch);saveLocal();emit();
    if(!(await writeChore(ch)))throw new Error(lastError||"クラウド保存に失敗しました");
  }
  async function removeChore(id){
    state.chores=state.chores.filter(x=>x.id!==id);saveLocal();emit();
    if(!(await deleteChoreCloud(id)))throw new Error(lastError||"クラウド削除に失敗しました");
  }
  async function setNames(names){
    state.names=names;saveLocal();emit();
    if(!(await writeNames()))throw new Error(lastError||"クラウド保存に失敗しました");
  }

  async function saveConfig(config){
    localStorage.setItem(CFG,JSON.stringify(config));client=null;
    if(channel&&client)client.removeChannel(channel);
    return await syncInitial();
  }
  async function writeTest(){
    if(!(await initClient()))return {ok:false,message:"Supabaseを初期化できません"};
    const c=cfg(),key="_connection_test";
    const {error:e1}=await client.from("household_settings").upsert(
      {household_id:c.householdId,setting_key:key,setting_value:{at:new Date().toISOString()}},
      {onConflict:"household_id,setting_key"});
    if(e1)return {ok:false,message:e1.message};
    const {data,error:e2}=await client.from("household_settings").select("setting_key")
      .eq("household_id",c.householdId).eq("setting_key",key).maybeSingle();
    if(e2||!data)return {ok:false,message:e2?.message||"読み込みに失敗"};
    await client.from("household_settings").delete().eq("household_id",c.householdId).eq("setting_key",key);
    return {ok:true,message:"Supabaseへの読み書きに成功しました"};
  }
  async function cloudCounts(){
    const d=await fetchCloud();return d?{chores:d.chores.length,records:d.records.length}:null;
  }

  window.KajiStore={
    init,snapshot,subscribe:(fn)=>{listeners.push(fn);return()=>listeners=listeners.filter(x=>x!==fn)},
    configured,config:cfg,saveConfig,writeTest,cloudCounts,pull,syncInitial,startAuto,
    addRecord,removeRecord,resetRecords,addChore,removeChore,setNames,
    lastError:()=>lastError
  };
})();
