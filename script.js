// ============================================
// 🔥 FIREBASE CONFIG
// ============================================
const firebaseConfig = {
    apiKey: "AIzaSyBzYFYYavMnPsWTmyN5BURsiw3PiWFRYgc",
    authDomain: "kashef-387b5.firebaseapp.com",
    projectId: "kashef-387b5",
    storageBucket: "kashef-387b5.firebasestorage.app",
    messagingSenderId: "562274891980",
    appId: "1:562274891980:web:87cf6ce147c0fe6785aa69",
    measurementId: "G-YS9Y0SB51G"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;

// ============================================
// 🔥 UTILITY FUNCTIONS
// ============================================
function toggleLoading(show) {
    document.getElementById('loader').style.display = show ? 'flex' : 'none';
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showPage(id) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById(id + "-page").classList.add("active");
    window.scrollTo(0, 0);
}

function checkAuthStatus() {
    if (currentUser) showPage('dashboard');
    else showPage('login');
}

// ============================================
// 🔥 AUTHENTICATION
// ============================================
auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    const heroTitle = document.getElementById("hero-title");
    const welcomeText = document.getElementById("welcome-text");

    if (user) {
        loadWatchlist();
        if (heroTitle) heroTitle.textContent = `Welcome back, ${user.email.split('@')[0]}!`;
        if (welcomeText) welcomeText.textContent = `Welcome, ${user.email.split('@')[0]}!`;
    } else {
        if (heroTitle) heroTitle.textContent = "Smart Price Tracking for Saudi Retailers";
    }
});

async function handleSignUp(e) {
    e.preventDefault();
    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-pass").value;

    toggleLoading(true);
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await db.collection("users").doc(cred.user.uid).set({
            name, email, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        toggleLoading(false);
        alert("Account created!");
        showPage('dashboard');
    } catch (err) {
        toggleLoading(false);
        alert(err.message);
    }
}

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-pass").value;

    toggleLoading(true);
    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            toggleLoading(false);
            showPage('dashboard');
        })
        .catch(err => {
            toggleLoading(false);
            alert(err.message);
        });
}

function forgotPassword() {
    const email = document.getElementById("login-email").value.trim();
    if (!email) return alert("Enter email first");
    auth.sendPasswordResetEmail(email)
        .then(() => alert("Reset email sent!"))
        .catch(err => alert(err.message));
}

function logout() {
    auth.signOut().then(() => showPage("home"));
}

// ============================================
// 🔥 WATCHLIST
// ============================================
async function addToWatchlist(name, price) {
    if (!currentUser) {
        alert("Please login first");
        showPage('login');
        return;
    }
    try {
        await db.collection("users").doc(currentUser.uid).collection("watchlist").add({
            name, price, timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert(`${name} added to watchlist!`);
        loadWatchlist();
    } catch (e) {
        alert("Error: " + e.message);
    }
}

async function loadWatchlist() {
    const box = document.getElementById("watchlist");
    if (!box || !currentUser) return;
    try {
        const snap = await db.collection("users").doc(currentUser.uid)
            .collection("watchlist").orderBy("timestamp", "desc").get();
        box.innerHTML = snap.empty ? "<p>Watchlist empty</p>" : "";
        snap.forEach(doc => {
            const item = doc.data();
            box.innerHTML += `
                <div class="wish-item">
                    <span><strong>${item.name}</strong> - ${item.price} SAR</span>
                    <i class="fa fa-trash-can" onclick="deleteItem('${doc.id}')" style="cursor:pointer;color:#ff4d4d;" title="Delete"></i>
                </div>`;
        });
    } catch (e) {
        console.error("Watchlist error:", e);
    }
}

async function deleteItem(id) {
    if (confirm("Remove item?")) {
        try {
            await db.collection("users").doc(currentUser.uid).collection("watchlist").doc(id).delete();
            loadWatchlist();
        } catch (e) {
            alert("Delete error");
        }
    }
}

// ============================================
// 🔥 AI SEARCH - THE MAGIC!
// ============================================
async function performSearch() {
    console.log("🔍 Search clicked!"); // DEBUG
    const query = document.getElementById('search-input').value.trim();

    if (!query) {
        alert('Please enter product name');
        return;
    }

    console.log("🚀 Searching for:", query); // DEBUG

    // Show loading
    toggleLoading(true);
    showPage('results');

    try {
        const products = [{ name: query, brand: '', description: query }];

        const response = await fetch('/api/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ products: products })
        });

        console.log("📡 API Response:", response.status); // DEBUG

        const data = await response.json();
        console.log("✅ Data received:", data); // DEBUG

        toggleLoading(false);

        if (data.success && data.results && data.results.length > 0) {
            displayMatchResults(data.results);
        } else {
            document.getElementById('product-list').innerHTML = `
                <div class="no-results">
                    <p>🔍 No matches found for "${query}"<br>
                    Try "iPhone", "headphones", "laptop", or "AirPods"</p>
                </div>`;
        }
    } catch (error) {
        console.error('🚨 Search Error:', error);
        toggleLoading(false);
        document.getElementById('product-list').innerHTML = `
            <div class="no-results">
                <p>❌ Search failed<br>Check console for details</p>
            </div>`;
    }
}

// ============================================
// 🔥 DISPLAY RESULTS - BEAUTIFUL CARDS
// ============================================
function displayMatchResults(results) {
    const productList = document.getElementById('product-list');
    productList.innerHTML = '';

    if (!results || results.length === 0) {
        productList.innerHTML = `
            <div class="no-results">
                <i class="fa fa-search" style="font-size:4rem;color:#d1d5db;"></i>
                <p>No AI matches found</p>
            </div>`;
        return;
    }

    // Group by source product
    const grouped = {};
    results.forEach(match => {
        if (!grouped[match.source_name]) grouped[match.source_name] = [];
        grouped[match.source_name].push(match);
    });

    for (const [sourceName, matches] of Object.entries(grouped)) {
        let matchHtml = '';

        matches.forEach(match => {
            matchHtml += `
            <div class="match-item">

                <div class="match-info">
                    <div class="match-name">${match.target_name}</div>
                    <div class="store">Found on: ${match.target_retailer}</div>
                </div>

                <div class="price">Price: ${match.target_price} SAR</div>

                <div class="card-actions">
                    <a href="${match.target_url}" target="_blank" class="action-btn btn-store">
                        <i class="fa-solid fa-up-right-from-square"></i> Go to Store
                    </a>

                    <button onclick="showPriceHistory('${match.target_name}')" class="action-btn btn-history">
                        <i class="fa-solid fa-chart-line"></i> Price History
                    </button>

                    ${currentUser ? `
                    <button onclick="addToWatchlist('${match.target_name}', ${match.target_price})" class="action-btn btn-watch">
                        ⭐ Add to Watchlist
                    </button>` : ''}

                </div>

            </div>
            `;
        });

        const card = document.createElement('div');
        card.className = 'simple-card';

        card.innerHTML = `
            <div class="card-header">
                <h2>${sourceName}</h2>
            </div>

            ${matchHtml}
        `;

        productList.appendChild(card);
    }
}
// ============================================
// 🔥 PRICE HISTORY MODAL
// ============================================
let priceChart = null;

function showPriceHistory(productName) {
    document.getElementById('history-modal').style.display = 'flex';
    document.getElementById('modal-product-title').textContent = `${productName} - Price History`;

    // Mock data for demo
    const ctx = document.getElementById('priceChart').getContext('2d');
    if (priceChart) priceChart.destroy();

    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
            datasets: [{
                label: 'Price (SAR)',
                data: [4500, 4300, 4200, 4100, 3999],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16,185,129,0.1)',
                tension: 0.4
            }]
        },
        options: { responsive: true }
    });
}

function closeModal() {
    document.getElementById('history-modal').style.display = 'none';
}

// ============================================
// 🔥 INIT
// ============================================
console.log("🚀 Kashef AI Frontend Loaded!");