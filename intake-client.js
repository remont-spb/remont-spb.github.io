(()=>{
  'use strict';
  const CONSENT_VERSION='2026-11-10-90d';
  const form=document.getElementById('materials-request');if(!form)return;
  const input=document.getElementById('materials-files'),drop=document.getElementById('materials-drop'),list=document.getElementById('materials-file-list'),message=document.getElementById('materials-file-message'),button=form.querySelector('button[type="submit"]'),note=document.getElementById('materials-demo-note');
  let files=[],config=null,busy=false,pollTimer=null,attempt=null,testKey='',pollBlocked=false;
  const ownerTest=new URLSearchParams(location.search).get('owner-test')==='1';
  // The test key is held only in this closure. Receipts are isolated by mode and API.
  const storageKey=api=>'chestnyi-intake-receipt-v2:'+ (ownerTest?'owner-test:':'public:')+api;
  const save=()=>{if(!config)return;try{sessionStorage.setItem(storageKey(config.api_origin),JSON.stringify(attempt));}catch{}};
  const restore=()=>{attempt=null;try{const value=JSON.parse(sessionStorage.getItem(storageKey(config.api_origin))||'null');if(value&&/^[a-zA-Z0-9_-]{32,100}$/.test(value.idem)&&/^[a-zA-Z0-9_-]{40,100}$/.test(value.token)&&typeof value.signature==='string')attempt=value;}catch{}};
  const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');
  const requestHeaders=()=>ownerTest?{'X-Test-Key':testKey}:{};
  const requestName=()=>ownerTest?'Тестовая заявка ':'Заявка ';
  function apiOrigin(value){const api=new URL(value);if(api.protocol!=='https:'||api.username||api.password||api.search||api.hash||api.pathname!=='/')throw new Error('Invalid API');return api.origin;}
  const key=f=>[f.name,f.size,f.lastModified].join('|');
  function render(){list.replaceChildren();for(const file of files){const li=document.createElement('li'),name=document.createElement('span'),remove=document.createElement('button');name.textContent=file.name+' · '+(file.size/1048576).toFixed(1)+' МБ';remove.type='button';remove.className='materials-remove';remove.textContent='Убрать';remove.disabled=busy;remove.setAttribute('aria-label','Убрать '+file.name);remove.addEventListener('click',()=>{if(busy)return;files=files.filter(f=>f!==file);render();input.focus();});li.append(name,remove);list.append(li);}}
  function add(incoming){if(busy)return;const errors=[];for(const file of incoming){if(!/\.(pdf|xlsx|xlsb|jpe?g|png)$/i.test(file.name)){errors.push(file.name+': неподдерживаемый формат.');continue;}if(!file.size){errors.push(file.name+': пустой файл.');continue;}if(files.some(f=>key(f)===key(file)))continue;if(files.length>=10||files.reduce((sum,f)=>sum+f.size,0)+file.size>50*1048576){errors.push(file.name+': превышен лимит файлов или общий размер.');continue;}files.push(file);}input.value='';message.textContent=errors.join(' ');render();}
  input.addEventListener('change',()=>add(Array.from(input.files)));
  drop.addEventListener('dragover',e=>{e.preventDefault();if(!busy)drop.classList.add('is-dragging');});drop.addEventListener('dragleave',()=>drop.classList.remove('is-dragging'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('is-dragging');add(Array.from(e.dataTransfer.files));});
  form.addEventListener('change',e=>{if(e.target.name!=='delivery')return;const field=document.getElementById('materials-contact'),label=document.getElementById('materials-contact-label'),channel=e.target.value;field.value='';field.type=channel==='email'?'email':channel==='max'?'tel':'text';field.autocomplete=channel==='email'?'email':channel==='max'?'tel':'off';field.placeholder=channel==='email'?'name@example.ru':channel==='max'?'+7…':'@username или телефон';label.textContent=channel==='email'?'Электронная почта':channel==='max'?'Телефон для связи в MAX':'Контакт в Telegram';});
  async function poll(){
    if(!attempt?.id||!config||document.hidden)return;
    const current=attempt;
    try{
      const response=await fetch(config.api_origin+'/v1/requests/'+encodeURIComponent(current.id),{headers:{...requestHeaders(),'X-Request-Token':current.token},signal:AbortSignal.timeout(15000)});
      if(response.status===403&&ownerTest){pollBlocked=true;clearInterval(pollTimer);message.textContent='Доступ к тестовой проверке отклонён. Проверьте тестовый ключ и подключение.';return;}
      if(!response.ok)throw new Error();
      const result=await response.json();if(attempt!==current)return;
      if(result.state==='accepted'){
        message.textContent=requestName()+current.id+' принята. Документы сохранены.'+(ownerTest?' Тест не учитывается среди реальных заявок.':' Команда свяжется с Вами для уточнения состава расчёта и срока.');
        clearInterval(pollTimer);attempt.accepted=true;save();
      }else if(result.state==='expired'){
        message.textContent='Срок хранения заявки '+current.id+' истёк. Для нового расчёта прикрепите документы и отправьте новую заявку.';
        clearInterval(pollTimer);current.expired=true;current.accepted=false;save();
      }else message.textContent=requestName()+current.id+' зарегистрирована. Сохраняем документы — пожалуйста, не отправляйте её повторно.';
    }catch{message.textContent='Номер заявки: '+current.id+'. Сейчас не удалось проверить сохранение документов. Проверка повторится автоматически.';}
  }
  const consent=document.createElement('label');consent.className='materials-field';consent.hidden=true;consent.style.display='none';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.name='consent';checkbox.value='yes';checkbox.required=true;checkbox.style.width='auto';
  consent.setAttribute('data-consent-version',CONSENT_VERSION);
  const consentText=document.createElement('span');consentText.textContent='Согласен на обработку указанных контактов и документов для подготовки расчёта и связи по заявке в соответствии с ';
  const consentLink=document.createElement('a');consentLink.href='./privacy.html';consentLink.target='_blank';consentLink.rel='noopener';consentLink.textContent='условиями обработки документов и контактов';consentLink.style.textDecoration='underline';consentLink.style.textUnderlineOffset='3px';consentText.append(consentLink,'.');
  consent.append(checkbox,consentText);button.before(consent);
  async function enable(value){
    const health=await fetch(value.api_origin+'/health',{headers:requestHeaders(),signal:AbortSignal.timeout(10000)});
    if(!health.ok)throw new Error('Intake unavailable');
    const readiness=await health.json();
    if(readiness.intake_enabled!==true&&!(ownerTest&&readiness.test_intake_enabled===true))throw new Error('Intake unavailable');
    config=value;restore();pollBlocked=false;consent.hidden=false;consent.style.display='';button.disabled=false;
    button.textContent=ownerTest?'Отправить тестовую заявку':'Отправить документы';
    note.textContent=ownerTest?'Режим проверки владельцем: '+value.api_origin+'. Используйте только искусственные документы и тестовый контакт. Ключ остаётся в памяти этой страницы; после перезагрузки введите его снова. Тест не учитывается среди пяти реальных заявок.':'Отправьте документы и получите номер заявки. Состав, стоимость и срок расчёта согласуем с Вами до его начала.';
    if(attempt?.id){await poll();if(!attempt.accepted&&!attempt.expired&&!pollBlocked)pollTimer=setInterval(poll,10000);}
  }
  function showOwnerPanel(){
    const panel=document.createElement('section');panel.className='materials-demo-note';panel.setAttribute('aria-label','Проверка приёма владельцем');
    const title=document.createElement('strong');title.textContent='Проверка приёма владельцем';
    const info=document.createElement('p');info.textContent='Введите постоянный HTTPS-адрес обработчика и закрытый тестовый ключ. Обычный приём на сайте остаётся выключенным.';
    const apiLabel=document.createElement('label');apiLabel.className='materials-field';apiLabel.textContent='HTTPS-адрес обработчика';
    const apiInput=document.createElement('input');apiInput.type='url';apiInput.autocomplete='off';apiInput.placeholder='https://…';apiInput.setAttribute('aria-label','HTTPS-адрес обработчика');apiLabel.append(apiInput);
    const keyLabel=document.createElement('label');keyLabel.className='materials-field';keyLabel.textContent='Закрытый тестовый ключ';
    const keyInput=document.createElement('input');keyInput.type='password';keyInput.autocomplete='off';keyInput.spellcheck=false;keyInput.setAttribute('aria-label','Закрытый тестовый ключ');keyLabel.append(keyInput);
    const connect=document.createElement('button');connect.type='button';connect.className='materials-remove';connect.textContent='Подключить тестовую форму';
    const status=document.createElement('p');status.setAttribute('role','status');
    connect.addEventListener('click',async()=>{
      if(busy)return;
      if(config){clearInterval(pollTimer);config=null;testKey='';attempt=null;button.disabled=true;consent.hidden=true;consent.style.display='none';apiInput.disabled=false;keyInput.disabled=false;connect.textContent='Подключить тестовую форму';status.textContent='Введите адрес и ключ для нового подключения.';return;}
      let origin;try{origin=apiOrigin(apiInput.value.trim());}catch{status.textContent='Укажите HTTPS-адрес без пути, параметров и пароля.';return;}
      const candidateKey=keyInput.value.trim();if(!/^[a-zA-Z0-9_-]{40,100}$/.test(candidateKey)){status.textContent='Введите выданный закрытый тестовый ключ целиком.';return;}
      connect.disabled=true;status.textContent='Проверяем доступность обработчика…';
      try{testKey=candidateKey;await enable({enabled:true,api_origin:origin});apiInput.disabled=true;keyInput.value='';keyInput.disabled=true;connect.textContent='Сменить подключение';status.textContent='Тестовая форма подключена. Ключ проверяется сервером при отправке.';}
      catch{config=null;testKey='';button.disabled=true;consent.hidden=true;consent.style.display='none';status.textContent='Обработчик пока недоступен для приёма. Проверьте адрес и повторите подключение.';}
      finally{connect.disabled=false;}
    });
    panel.append(title,info,apiLabel,keyLabel,connect,status);note.after(panel);
    note.textContent='Открыт режим проверки владельцем. Отправка станет доступна после подключения ниже. Ключ не сохраняется в ссылке или памяти браузера между загрузками страницы.';
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy||!config?.enabled)return;
    if(!form.reportValidity())return;
    if(!files.length){message.textContent='Прикрепите хотя бы один документ.';input.focus();return;}
    busy=true;button.disabled=true;input.disabled=true;render();
    try{
      const body=new FormData(form);for(const f of files)body.append('files',f,f.name);
      const content=JSON.stringify([...body.entries()].filter(([k])=>k!=='files'))+files.map(key).join(';');
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content))),v=>v.toString(16).padStart(2,'0')).join('');
      if(attempt?.signature!==digest||attempt?.expired){attempt={idem:random(),token:random(),signature:digest};save();}
      if(attempt.id){await poll();return;}
      message.textContent='Передаём документы. Не закрывайте страницу до получения номера заявки.';
      const response=await fetch(config.api_origin+'/v1/requests',{method:'POST',body,headers:{...requestHeaders(),'Idempotency-Key':attempt.idem,'X-Request-Token':attempt.token},signal:AbortSignal.timeout(120000)});
      const result=await response.json();if(!response.ok)throw new Error(ownerTest?(response.status===403?'Доступ к тестовой отправке отклонён. Проверьте тестовый ключ.':'Тестовая заявка не принята. Проверьте поля формы и доступность обработчика.'):(result.error||'Не удалось отправить заявку.'));
      attempt.id=result.request_id;save();await poll();clearInterval(pollTimer);if(!attempt.accepted&&!attempt.expired&&!pollBlocked)pollTimer=setInterval(poll,10000);
    }catch(error){message.textContent=error.name==='TimeoutError'||error instanceof TypeError?'Связь прервалась. Попробуйте отправить ещё раз: повтор будет проверен, чтобы не создавать вторую заявку.':error.message;}
    finally{busy=false;button.disabled=false;input.disabled=false;render();}
  });
  async function initialize(){
    try{
      const response=await fetch('./intake-config.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)return;
      const value=await response.json();if(value.enabled!==true||typeof value.api_origin!=='string')return;
      value.api_origin=apiOrigin(value.api_origin);await enable(value);
    }catch{/* Preserve honest disabled state when configuration or backend is unavailable. */}
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
  if(/^https?:$/.test(location.protocol)){if(ownerTest)showOwnerPanel();else initialize();}
})();
