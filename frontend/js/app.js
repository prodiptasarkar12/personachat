let state = { userId: '', personas: [], persona: null, conversationId: null };
const $ = (id) => document.getElementById(id);
async function api(url, options = {}) { const r = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options }); const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || 'Request failed'); return data; }
async function enterApp() {
  const userId = $('userId').value.trim();
  if (!userId) return alert('Enter your User ID');
  try { const user = await api('/api/auth/user', { method:'POST', body: JSON.stringify({ userId }) }); state.userId = user.userId; localStorage.setItem('personaUserId', state.userId); await loadPersonas(); $('landing').classList.add('hidden'); $('chatScreen').classList.remove('hidden'); } catch(e) { alert(e.message); }
}
async function loadPersonas() { state.personas = await api('/api/personas'); $('personaList').innerHTML = state.personas.length ? state.personas.map(p => `<button class="persona" onclick="startChat(${p.id})"><div class="avatar">${escapeHtml((p.name||'P')[0])}</div><div><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.language)} · ${escapeHtml(p.chatStyle)}</small></div></button>`).join('') : '<div class="empty">No active personas yet.</div>'; }
async function startChat(id) { try { const data = await api('/api/chat/start', { method:'POST', body: JSON.stringify({ userId: state.userId, personaId:id }) }); state.persona=data.persona; state.conversationId=data.conversationId; $('chatHeader').innerHTML=`<div class="avatar">${escapeHtml((state.persona.name||'P')[0])}</div><div><strong>${escapeHtml(state.persona.name)}</strong><small>AI simulation · ${escapeHtml(state.persona.language)}</small></div>`; $('composer').classList.remove('hidden'); await loadConversation(); } catch(e) { alert(e.message); } }
async function loadConversation() { const c=await api(`/api/chat/${state.conversationId}`); $('messages').innerHTML=c.messages.length ? c.messages.map(renderMessage).join('') : '<div class="empty">Say hello 👋</div>'; scrollBottom(); }
function renderMessage(m) { return `<div class="msg ${m.role==='user'?'out':'in'}"><div>${escapeHtml(m.content).replace(/\n/g,'<br>')}</div><time>${new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time></div>`; }
async function sendMessage() { const input=$('messageInput'); const message=input.value.trim(); if(!message||!state.conversationId)return; input.value=''; $('messages').insertAdjacentHTML('beforeend', renderMessage({role:'user',content:message,createdAt:new Date()})); scrollBottom(); const typing=document.createElement('div'); typing.className='typing'; typing.textContent='typing…'; $('messages').appendChild(typing); scrollBottom(); try { const data=await api(`/api/chat/${state.conversationId}/message`, {method:'POST',body:JSON.stringify({message})}); typing.remove(); $('messages').insertAdjacentHTML('beforeend',renderMessage(data.message)); scrollBottom(); } catch(e) { typing.remove(); alert(e.message); } }
function scrollBottom(){const m=$('messages');m.scrollTop=m.scrollHeight;}
function logout(){localStorage.removeItem('personaUserId');location.reload();}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
$('messageInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
const saved=localStorage.getItem('personaUserId'); if(saved){$('userId').value=saved;}
