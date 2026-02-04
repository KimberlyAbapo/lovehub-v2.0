const SUPABASE_URL = 'https://etxxmreaabhjkfsafmlb.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0eHhtcmVhYWJoamtmc2FmbWxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4NTkyNTUsImV4cCI6MjA4NTQzNTI1NX0.VoIX2GvFsVnS327mNLWDE3cfT79THe0YRSJNAtnlxH4';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loggedInTeacher = localStorage.getItem('active_teacher');
if (!loggedInTeacher) { window.location.href = 'login.html'; }

let currentSubj = ""; 
let isTeacher = false;
const MASTER_ADMIN = "ADMIN_KIM"; 

// 🚀 INITIAL LOAD
window.onload = async () => {
    showLoader(true);
    document.getElementById('teacher-display-name').innerText = loggedInTeacher;

    const { data: teacherData } = await _supabase.from('teachers').select('*').eq('name', loggedInTeacher).single();
    
    if (teacherData) {
        isTeacher = true;

        // 🔥 KANI NGA LINE PARA SA TIMER
        startGlobalTimer(teacherData.expiry_date, teacherData.name);

        const adminBtns = document.getElementById('admin-btns');
        if(adminBtns) {
            adminBtns.style.display = 'flex'; 
            const buttons = adminBtns.getElementsByTagName('button');
            for (let btn of buttons) {
                const clickAttr = btn.getAttribute('onclick') || "";
                if (clickAttr.includes('manageStudents') || clickAttr.includes('toggleM')) {
                    btn.style.display = 'inline-block';
                }
                if (clickAttr.includes('addNewTeacher') || clickAttr.includes('resetLeaderboard')) {
                    btn.style.display = (loggedInTeacher === MASTER_ADMIN) ? 'inline-block' : 'none';
                }
            }
        }
    }

    await loadStudents();
    await loadSettings(); 
    await updateLeaderboard();
    
    const lockedName = localStorage.getItem('lock_name');
    if (lockedName) {
        const selectEl = document.getElementById('student-name-select');
        if (selectEl) {
            selectEl.value = lockedName;
            if (!isTeacher) { selectEl.disabled = true; }
        }
        await trackOnlineStatus(lockedName);
        setInterval(() => trackOnlineStatus(lockedName), 20000);
    }
    
    fetchOnlineUsers();
    setInterval(fetchOnlineUsers, 5000); 

    startFloatingIcons();
    showLoader(false);
};

// ⏳ NEW TIMER LOGIC (REAL-TIME CLOCK & COUNTDOWN)
function startGlobalTimer(expiryStr, name) {
    const countdownEl = document.getElementById('expiry-countdown');
    const dateTimeEl = document.getElementById('display-date-time');

    if (!countdownEl || !dateTimeEl) return;

    setInterval(() => {
        const now = new Date();
        
        // 1. I-display ang Oras sa Pilipinas
        dateTimeEl.innerHTML = now.toLocaleString('en-PH', { 
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit' 
        }).toUpperCase();

        // 2. I-calculate ang Countdown
        if (name === MASTER_ADMIN) {
            countdownEl.innerHTML = "👑 MASTER ADMIN | UNLIMITED ACCESS";
            countdownEl.style.color = "var(--gold)";
        } else if (expiryStr) {
            const expiryDate = new Date(expiryStr).getTime();
            const distance = expiryDate - now.getTime();

            if (distance < 0) {
                countdownEl.innerHTML = "🚩 ACCESS EXPIRED";
                countdownEl.style.color = "var(--red)";
                resetDeviceLock(); // I-logout kung expired na
            } else {
                const d = Math.floor(distance / (1000 * 60 * 60 * 24));
                const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                const s = Math.floor((distance % (1000 * 60)) / 1000);
                countdownEl.innerHTML = `⏳ KUTOB: ${d}d ${h}h ${m}m ${s}s`;
                countdownEl.style.color = (d < 3) ? "var(--red)" : "var(--purp)";
            }
        }
    }, 1000);
}

// 🟢 TRACKING LOGIC
async function trackOnlineStatus(name) { 
    if(!name) return; 
    try {
        await _supabase.from('students')
            .update({ last_active: new Date().toISOString() })
            .eq('name', name); 
    } catch (err) {
        console.error("Status Update Failed", err);
    }
}

// 🟢 NAME SELECTION
async function handleNameSelect(v) { 
    if (!v || (localStorage.getItem('lock_name') && !isTeacher)) return; 
    if (confirm(`Lock device for ${v}?`)) { 
        showLoader(true);
        localStorage.setItem('lock_name', v); 
        await trackOnlineStatus(v);
        location.reload(); 
    } 
}

// 👑 ADMIN ACTION WRAPPER
function adminAction(fn) {
    const masterFunctions = ['addNewTeacher', 'deleteTeacher', 'resetLeaderboard'];
    if (masterFunctions.includes(fn.name)) {
        if (loggedInTeacher === MASTER_ADMIN) fn();
        else alert("🔒 Access Denied: Master Admin access only.");
    } else {
        if (isTeacher) fn();
        else alert("Teacher account required!");
    }
}

// 🔄 HUB MANAGER TAB SYSTEM (Admin Kim only)
function switchTab(type) {
    if (loggedInTeacher !== MASTER_ADMIN) return;
    if(type === 'students') {
        document.getElementById('panel-students').style.display = 'block';
        document.getElementById('panel-teachers').style.display = 'none';
        document.getElementById('tab-st').classList.add('active');
        document.getElementById('tab-tc').classList.remove('active');
        renderModalStudentList();
    } else {
        document.getElementById('panel-students').style.display = 'none';
        document.getElementById('panel-teachers').style.display = 'block';
        document.getElementById('tab-st').classList.remove('active');
        document.getElementById('tab-tc').classList.add('active');
        renderModalTeacherList();
    }
}

// 👩‍🏫 TEACHER MGMT
async function renderModalTeacherList() {
    const { data } = await _supabase.from('teachers').select('*').order('name');
    const list = document.getElementById('teacher-modal-list');
    
    list.innerHTML = data?.map(t => {
        const karon = new Date();
        const exp = new Date(t.expiry_date);
        const diffTime = exp - karon;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const statusColor = diffDays <= 3 ? 'red' : 'green';

        return `
        <div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid #eee; font-size:12px; background:white; border-radius:12px; margin-bottom:8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div>
                <b style="color:var(--purp);">${t.name}</b><br>
                <small style="color:${statusColor}; font-weight:bold;">
                    ${t.is_active && diffTime > 0 ? `✅ ${diffDays} days left` : '❌ Inactive/Expired'}
                </small>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
                ${t.name !== MASTER_ADMIN ? `
                    <button onclick="deleteTeacher('${t.id}')" style="color:var(--red); border:none; background:none; cursor:pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : '<i class="fas fa-crown" style="color:var(--gold)"></i>'}
            </div>
        </div>`;
    }).join('') || "No teachers found.";
}

// 📋 STUDENTS FILTERING (FILTERED FOR EVERYONE)
async function loadStudents() {
    const { data } = await _supabase.from('students')
        .select('*')
        .eq('teacher_name', loggedInTeacher)
        .order('name');

    const select = document.getElementById('student-name-select');
    if (select) {
        select.innerHTML = '<option value="">Select Student Name</option>';
        data?.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.name;
            opt.textContent = s.name + (s.name.includes("KIMBERLY") ? " 👩‍🏫" : "");
            select.appendChild(opt);
        });
        const saved = localStorage.getItem('lock_name');
        if (saved) select.value = saved;
    }
}

function manageStudents() {
    const modal = document.getElementById('student-modal');
    if(modal) {
        modal.style.display = 'flex';
        renderModalStudentList();
    }
}

async function renderModalStudentList() {
    const { data } = await _supabase.from('students')
        .select('*')
        .eq('teacher_name', loggedInTeacher)
        .order('name');

    const listEl = document.getElementById('modal-list');
    if(listEl) {
        listEl.innerHTML = data?.map(s => `
            <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #eee; font-size:12px; background:#f9f9f9; margin-bottom:4px; border-radius:5px;">
                <span><b>${s.name}</b></span>
                <button onclick="deleteStudent(${s.id})" style="color:red; border:none; background:none; cursor:pointer;"><i class="fas fa-trash"></i></button>
            </div>`).join('') || "<p style='text-align:center; font-size:11px;'>No students found.</p>";
    }
}

async function addNewStudent() {
    const n = document.getElementById('new-student-name').value.toUpperCase().trim();
    if(n) { 
        await _supabase.from('students').insert([{ name: n, teacher_name: loggedInTeacher }]); 
        document.getElementById('new-student-name').value = ""; 
        renderModalStudentList(); 
        loadStudents(); 
    }
}

// 🟢 ONLINE USERS (FILTERED FOR EVERYONE)
async function fetchOnlineUsers() {
    const now = new Date();
    const { data: students } = await _supabase.from('students')
        .select('name, last_active, teacher_name')
        .eq('teacher_name', loggedInTeacher);

    const listEl = document.getElementById('online-list');
    if(listEl && students) {
        listEl.innerHTML = students.map(u => {
            const isOnline = u.last_active && (now - new Date(u.last_active)) < 60000;
            const dotColor = isOnline ? '#2ecc71' : '#bdc3c7';
            const statusText = isOnline ? 'Online' : 'Offline';
            return `
                <div style="font-size:11px; display:flex; align-items:center; justify-content:space-between; padding:6px; background:white; border-radius:8px; margin-bottom:4px; border-left: 3px solid ${dotColor};">
                    <span>${u.name.includes("KIM") ? '👩‍🏫' : '👶'} <b>${u.name}</b></span> 
                    <div style="display:flex; align-items:center;">
                        <small style="font-size:9px; color:#999; margin-right:5px;">${statusText}</small>
                        <span style="width:8px; height:8px; background:${dotColor}; border-radius:50%; box-shadow: 0 0 4px ${dotColor};"></span>
                    </div>
                </div>`;
        }).join('') || "No online students.";
    }
}

// 📁 SUBJECTS & FILES (SUPPORT ALL FORMATS)
async function renderFiles() {
    const container = document.getElementById('file-grid-container');
    const lockName = localStorage.getItem('lock_name');
    
    const { data: files } = await _supabase.from('lovehub_files')
        .select('*')
        .eq('subject', currentSubj)
        .eq('teacher_name', loggedInTeacher);

    const { data: views } = await _supabase.from('file_views').select('*');
    
    if(container) {
        container.innerHTML = files?.length ? "" : "<p style='text-align:center; padding:20px; color:#999;'>No materials available yet.</p>";
        files?.forEach(f => {
            const hasSeen = views?.some(v => v.file_id === f.id && v.student_name === lockName);
            const ext = f.storage_path.split('.').pop().toLowerCase();
            let icon = "fa-file-pdf"; 
            let color = "var(--red)";

            if(['jpg','jpeg','png','gif','webp'].includes(ext)) { icon = "fa-file-image"; color = "#3498db"; }
            else if(['doc','docx'].includes(ext)) { icon = "fa-file-word"; color = "#2980b9"; }
            else if(['mp4','mov','avi'].includes(ext)) { icon = "fa-file-video"; color = "#1abc9c"; }
            else if(['ppt','pptx'].includes(ext)) { icon = "fa-file-powerpoint"; color = "#e67e22"; }

            const card = document.createElement('div');
            card.className = 'file-card';
            card.innerHTML = `
                <i class="fas ${icon} fa-3x" style="color:${color}"></i>
                <div style="font-size:11px; font-weight:bold; margin:10px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name}</div>
                <button onclick="markAsSeen(${f.id})" style="background:${hasSeen?'#9b59b6':'var(--green)'}; border:none; color:white; padding:8px; border-radius:15px; cursor:pointer; width:100%; font-weight:bold;">${hasSeen?'REVIEW':'OPEN'}</button>
                ${isTeacher ? `<div onclick="deleteFile(${f.id}, '${f.storage_path}')" style="color:red; cursor:pointer; margin-top:10px; font-size:10px;"><i class="fas fa-trash"></i> Delete</div>` : ''}`;
            container.appendChild(card);
        });
    }
}

// 🏆 LEADERBOARD
async function updateLeaderboard() {
    const { data } = await _supabase.from('file_views')
        .select('student_name, students!inner(teacher_name)')
        .eq('students.teacher_name', loggedInTeacher);

    const counts = {};
    data?.forEach(v => { if (!v.student_name.includes("KIM")) counts[v.student_name] = (counts[v.student_name] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 5);
    const listEl = document.getElementById('leaderboard-list');
    if(listEl) {
        listEl.innerHTML = sorted.map(([n, s], i) => `<div style="display:flex; justify-content:space-between; font-size:11px; padding:5px; background:white; border-radius:8px; margin-bottom:3px;"><span>${i+1}. ${n}</span><span style="color:var(--p-pink); font-weight:bold;">${s} ⭐</span></div>`).join('') || "No stars recorded.";
    }
}

async function saveFile(input) {
    if (!input.files[0] || !isTeacher) return;
    const file = input.files[0];
    let customName = prompt("Material Name?", file.name);
    if (!customName) return;
    showLoader(true);
    const path = `materials/${loggedInTeacher}/${Date.now()}_${file.name}`;
    
    try {
        const { error: uploadError } = await _supabase.storage.from('hub-materials').upload(path, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = _supabase.storage.from('hub-materials').getPublicUrl(path);
        
        await _supabase.from('lovehub_files').insert([{ 
            name: customName.toUpperCase(), 
            subject: currentSubj, 
            data: urlData.publicUrl, 
            storage_path: path,
            teacher_name: loggedInTeacher 
        }]);
        renderFiles(); 
    } catch (err) {
        alert("Upload Error: " + err.message);
    } finally {
        showLoader(false);
        input.value = ""; 
    }
}

// --- ALL HELPER FUNCTIONS ---
function openSubject(t) {
    currentSubj = t;
    document.getElementById('welcome-view').style.display = 'none';
    document.getElementById('subject-view').style.display = 'block';
    document.getElementById('subj-title').innerText = t;
    const addBtn = document.getElementById('add-material-btn');
    if(addBtn) addBtn.style.display = isTeacher ? 'inline-block' : 'none';
    renderFiles();

}

async function loadSettings() {
    const { data } = await _supabase.from('teachers').select('photo_data, announcement').eq('name', loggedInTeacher).single();
    if (data) {
        if (data.announcement) document.getElementById('announcement-text').innerText = data.announcement;
        if (data.photo_data) {
            document.getElementById('p-view').innerHTML = `<img src="${data.photo_data}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        }
    }
}

async function uploadTeacherPhoto(input) {
    if (!input.files[0]) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64 = e.target.result;
        showLoader(true);
        await _supabase.from('teachers').update({ photo_data: base64 }).eq('name', loggedInTeacher);
        document.getElementById('p-view').innerHTML = `<img src="${base64}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        showLoader(false);
        alert("Profile Picture Updated! ✨");
    };
    reader.readAsDataURL(input.files[0]);
}

function showLoader(s) { document.getElementById('loader').style.display = s ? 'flex' : 'none'; }
function toggleM(id) { const el = document.getElementById(id); el.style.display = (el.style.display === 'block') ? 'none' : 'block'; }
function closeSubject() { document.getElementById('welcome-view').style.display = 'block'; document.getElementById('subject-view').style.display = 'none'; }
function triggerConfetti() { confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } }); }
function startFloatingIcons() {
    const container = document.getElementById('automation-layer');
    if(!container) return;
    setInterval(() => {
        const i = document.createElement('i'); i.className = 'fas fa-heart floating-icon';
        i.style.left = Math.random() * 100 + "vw"; i.style.position = 'absolute';
        container.appendChild(i); setTimeout(() => i.remove(), 8000);
    }, 4000);
}
function closeStudentModal() { document.getElementById('student-modal').style.display = 'none'; }
function resetDeviceLock() {
    if (confirm("Logout from this device?")) {
        localStorage.clear(); window.location.href = 'login.html';
    }
}
async function deleteStudent(id) { if(confirm("Delete this student?")) { await _supabase.from('students').delete().eq('id', id); renderModalStudentList(); loadStudents(); } }
async function deleteTeacher(id) { if(confirm("Delete this teacher?")) { await _supabase.from('teachers').delete().eq('id', id); renderModalTeacherList(); } }
async function resetLeaderboard() { if(confirm("Reset leaderboard stars?")) { await _supabase.from('file_views').delete().neq('id', 0); updateLeaderboard(); } }
async function deleteFile(id, path) { if(confirm("Delete this file permanently?")) { showLoader(true); await _supabase.storage.from('hub-materials').remove([path]); await _supabase.from('lovehub_files').delete().eq('id', id); renderFiles(); showLoader(false); } }

async function markAsSeen(id) {
    const lockName = localStorage.getItem('lock_name');
    if(!lockName) return alert("Please select your name first!");
    const { data: existing } = await _supabase.from('file_views').select('*').eq('file_id', id).eq('student_name', lockName);
    if(!existing?.length && !isTeacher) {
        await _supabase.from('file_views').insert([{ file_id: id, student_name: lockName, category: currentSubj }]);
        triggerConfetti(); updateLeaderboard();
    }
    const { data } = await _supabase.from('lovehub_files').select('data').eq('id', id).single();
    if(data) window.open(data.data, "_blank");
}

async function addNewTeacher() {
    if (loggedInTeacher !== MASTER_ADMIN) {
        return alert("🔒 Security: Master Admin lang ang maka-add og maestra!");
    }
    const name = document.getElementById('nt-name').value.toUpperCase().trim();
    const pass = document.getElementById('nt-pass').value.trim();
    const days = parseInt(document.getElementById('nt-days').value) || 30;
    if (!name || !pass) return alert("Palihog isulod ang Name ug Password! 🎀");
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    showLoader(true);
    try {
        const { error } = await _supabase.from('teachers').insert([{
            name: name,
            password: pass,
            is_active: true,
            expiry_date: expiryDate.toISOString()
        }]);
        if (error) throw error;
        alert(`Success! Si ${name} mahimo na nga mo-login hangtod ${expiryDate.toLocaleDateString()}. ✨`);
        document.getElementById('nt-name').value = "";
        document.getElementById('nt-pass').value = "";
        document.getElementById('nt-days').value = "";
        renderModalTeacherList();
    } catch (err) {
        alert("Error adding teacher: " + err.message);
    } finally {
        showLoader(false);
    }
}

// 👑 MASTER ADMIN: CHANGE OWN PASSWORD
async function changeMasterPassword() {
    if (loggedInTeacher !== MASTER_ADMIN) {
        return alert("🔒 Forbidden: Master Admin lang ang maka-usab niini.");
    }

    const newPass = document.getElementById('admin-new-pass').value.trim();
    
    if (newPass.length < 4) {
        return alert("Palihog pag-input og mas taas nga password (min 4 characters). 🎀");
    }

    if (confirm("Sigurado ka nga usbon nimo ang Master Password? Kinahanglan ka mo-login pag-usab.")) {
        showLoader(true);
        try {
            const { error } = await _supabase
                .from('teachers')
                .update({ password: newPass })
                .eq('name', MASTER_ADMIN);

            if (error) throw error;

            alert("Master Password Updated! Mag-restarting ang portal... ✨");
            localStorage.clear();
            window.location.href = 'login.html';
        } catch (err) {
            alert("Error updating password: " + err.message);
        } finally {
            showLoader(false);
        }
    }
}