// 公開版のデータ保存先（Firebase）。アプリ本体（index.html）はこのファイルの B.○○ を通して共有データを読み書きする。
(function(){
  const cfg={
    apiKey:"AIzaSyDBBGf3wkvY0zmngDWEZ-gYV75_vQO9VG0",
    authDomain:"vegas-golf-c8417.firebaseapp.com",
    projectId:"vegas-golf-c8417",
    storageBucket:"vegas-golf-c8417.firebasestorage.app",
    messagingSenderId:"972688979101",
    appId:"1:972688979101:web:260e0267535104c0389074"
  };
  if(!window.firebase){return;} // 読み込めなかった時は、試し用の仕組みで動く
  firebase.initializeApp(cfg);
  const db=firebase.firestore(), auth=firebase.auth(), FV=firebase.firestore.FieldValue, TS=firebase.firestore.Timestamp;
  try{db.enablePersistence({synchronizeTabs:true}).catch(()=>{});}catch(e){} // 電波がない時も最後に読んだ内容を表示・入力はあとで送る
  const H=18;
  const evRef=code=>db.collection('events').doc(code);
  const endOf=date=>new Date(date+'T00:00:00').getTime()+48*3600*1000;
  const grp=(g,p)=>Object.keys(g||{}).find(k=>g[k].members.includes(p))||null;
  const isDenied=e=>e&&(e.code==='permission-denied'||e.code==='firestore/permission-denied');

  window.VEGAS_BACKEND={name:'firebase',
    // イベント（ID）の内容とスコアを見張って、変わるたびに cb を呼ぶ
    watch(code,cb){let ev=null; const sc={};
      const u1=evRef(code).onSnapshot(s=>{
        if(!s.exists){ if(s.metadata.fromCache) return; cb(null); return; } const d=s.data(); // 電波がなく手元にもない時は、届くまで待つ
        if(d.expireAt&&d.expireAt.toMillis()<Date.now()){cb(null);return;}
        ev={code,date:d.date,name:d.name||'',course:d.course||'',pars:d.pars,players:d.players,groups:d.groups||{},scores:sc}; cb(ev);
      },()=>cb(null));
      const u2=evRef(code).collection('scores').onSnapshot(q=>{
        q.docChanges().forEach(ch=>{const m=(ch.doc.data()||{}).s||{}; sc[ch.doc.id]=Array.from({length:H},(_,i)=>m[i]??null);});
        if(ev){ev.scores=sc; cb(ev);}
      },()=>{});
      return ()=>{u1();u2();};},
    // IDを発行（4桁の数字。使われていない番号を選ぶ）
    async createEvent(d){const exp=TS.fromMillis(endOf(d.date));
      for(let n=0;n<15;n++){const code=String(1000+Math.floor(Math.random()*9000)), ref=evRef(code);
        try{
          const ok=await db.runTransaction(async t=>{const s=await t.get(ref); if(s.exists) return false;
            t.set(ref,{code,date:d.date,name:d.name,course:d.course,pars:d.pars.slice(),
              players:d.players.map((nm,j)=>({id:'p'+(j+1),name:nm})),groups:{},expireAt:exp,createdAt:FV.serverTimestamp()}); return true;});
          if(ok) return code;
        }catch(e){ if(isDenied(e)){ try{await ref.delete();}catch(e2){} continue; } throw e; } // 期限切れの古いIDなら消して別の番号へ
      }
      throw new Error('no-code');},
    setScore(code,pid,i,v){return evRef(code).collection('scores').doc(pid).set({s:{[i]:v}},{merge:true});},
    // 組を作る（すでに選ばれている人がいないか、送る直前に確かめる）
    createGroup(code,me,picks){const ref=evRef(code);
      return db.runTransaction(async t=>{const s=await t.get(ref); if(!s.exists) return {missing:true}; const g=s.data().groups||{};
        if(grp(g,me)) return {already:grp(g,me)}; const taken=picks.filter(p=>grp(g,p)); if(taken.length) return {taken};
        const gid=String(Math.max(0,...Object.keys(g).map(Number))+1);
        t.update(ref,{['groups.'+gid]:{by:me,members:[me,...picks]}}); return {gid};});},
    removeFromGroup(code,pid){const ref=evRef(code);
      return db.runTransaction(async t=>{const s=await t.get(ref); if(!s.exists) return; const g=s.data().groups||{}, k=grp(g,pid); if(!k) return;
        const m=g[k].members.filter(x=>x!==pid);
        t.update(ref,m.length?{['groups.'+k+'.members']:m}:{['groups.'+k]:FV.delete()});});},
    // 期限が過ぎたイベントのデータを消す（発行した人のスマホで行う）
    async cleanup(code,n){const ref=evRef(code);
      for(let j=1;j<=n;j++){try{await ref.collection('scores').doc('p'+j).delete();}catch(e){}}
      try{await ref.delete();}catch(e){}},
    auth:{instant:false,
      onChange(cb){auth.onAuthStateChanged(u=>cb(u?{uid:u.uid,label:u.email||u.displayName||'登録済み'}:null));},
      isLink(link){try{return auth.isSignInWithEmailLink(link);}catch(e){return false;}},
      sendLink(email){try{localStorage.setItem('vegas-mail',email);}catch(e){}
        return auth.sendSignInLinkToEmail(email,{url:location.origin+location.pathname,handleCodeInApp:true});},
      completeLink(email,link){return auth.signInWithEmailLink(email,link);},
      google(){return auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());},
      async deleteAccount(uid){const u=auth.currentUser; if(!u) return {ok:false};
        const q=await db.collection('users').doc(u.uid).collection('rounds').get();
        for(const d of q.docs){await d.ref.delete();}
        try{await u.delete(); return {ok:true};}
        catch(e){ if(e&&e.code==='auth/requires-recent-login'){await auth.signOut(); return {relogin:true};} throw e; }}},
    history:{
      watch(uid,cb){return db.collection('users').doc(uid).collection('rounds').onSnapshot(q=>cb(q.docs.map(d=>d.data())),()=>cb([]));},
      save(uid,rec){return db.collection('users').doc(uid).collection('rounds').doc(rec.id).set(rec);},
      del(uid,id){return db.collection('users').doc(uid).collection('rounds').doc(id).delete();}}
  };
})();
