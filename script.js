// ==========================================
// 1. Firebase Configuration & Initialization
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyA-q4wanQxFdY37sopYSDqTCetJRWhCvWE",
    authDomain: "kashef-7d7b1.firebaseapp.com",
    databaseURL: "https://kashef-7d7b1-default-rtdb.firebaseio.com",
    projectId: "kashef-7d7b1",
    storageBucket: "kashef-7d7b1.firebasestorage.app",
    messagingSenderId: "440870120852",
    appId: "1:440870120852:web:14c6d98f5867acad8bb381",
    measurementId: "G-FNZDMDBQ1E"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const rtdb = firebase.database();

let currentUser = null;
let priceChartInstance = null;

// ==========================================
// 2. UI & Navigation Logic
// ==========================================
function showPage(id) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById(id + "-page").classList.add("active");
    window.scrollTo(0,0);

    // Load user data if navigating to dashboard
    if (id === 'dashboard' && currentUser) {
        loadUserData();
    }
}

function toggleLoading(show) {
    document.getElementById("loader").style.display = show ? "flex" : "none";
}

// ==========================================
// 3. Authentication Logic (RESTORED)
// ==========================================
auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
        document.getElementById("welcome-text").innerText = "Welcome back!";
        loadUserData();
    } else {
        document.getElementById("welcome-text").innerText = "Discover the best prices today";
    }
});

function checkAuthStatus() {
    if(currentUser) showPage('dashboard');
    else showPage('login');
}

async function handleLogin(e) {
    e.preventDefault();
    toggleLoading(true);
    try {
        const email = document.getElementById("login-email").value;
        const pass = document.getElementById("login-pass").value;
        await auth.signInWithEmailAndPassword(email, pass);
        Swal.fire('Success', 'Logged in successfully!', 'success');
        showPage('dashboard');
    } catch (err) {
        Swal.fire('Login Error', err.message, 'error');
    } finally {
        toggleLoading(false);
    }
}

async function handleSignUp(e) {
    e.preventDefault();
    toggleLoading(true);
    try {
        const email = document.getElementById("signup-email").value;
        const pass = document.getElementById("signup-pass").value;
        await auth.createUserWithEmailAndPassword(email, pass);
        Swal.fire('Success', 'Account created successfully!', 'success');
        showPage('dashboard');
    } catch (err) {
        Swal.fire('Signup Error', err.message, 'error');
    } finally {
        toggleLoading(false);
    }
}

async function logout() {
    await auth.signOut();
    Swal.fire('Logged out', 'You have been successfully logged out.', 'info');
    showPage('home');
}

async function forgotPassword() {
    const email = document.getElementById("login-email").value;
    if(!email) {
        Swal.fire('Note', 'Please enter your email first.', 'warning');
        return;
    }
    try {
        await auth.sendPasswordResetEmail(email);
        Swal.fire('Sent!', 'Password reset link sent to your email.', 'success');
    } catch(err) {
        Swal.fire('Error', err.message, 'error');
    }
}

// ==========================================
// 4. Search Logic (Amazon & Noon Integration)
// ==========================================
async function performSearch() {
    const query = document.getElementById("search-input").value.trim().toLowerCase();
    const productList = document.getElementById("product-list");

    if (!query) {
        Swal.fire('Note', 'Please enter a product name.', 'info');
        return;
    }

    toggleLoading(true);
    productList.className = "results-list-container"; // or "product-grid" if you want team cards
    productList.innerHTML = "";

    try {
        // 1. Fetch data from Firebase
        const [amazonSnap, noonSnap] = await Promise.all([
            rtdb.ref("amazon-products").once("value"),
            rtdb.ref("noon-products").once("value")
        ]);

        const amazonData = amazonSnap.val() || {};
        const noonData = noonSnap.val() || {};

        // 2. Combine into one list
        const allProducts = [];
        Object.keys(amazonData).forEach(id => allProducts.push({ id, ...amazonData[id] }));
        Object.keys(noonData).forEach(id => allProducts.push({ id, ...noonData[id] }));

        // 3. Filter and Render
        let found = false;
        allProducts.forEach(product => {
            const title = product.title || product.name || "";

            // Check if the product matches the user search
            if (title.toLowerCase().includes(query)) {
                found = true;
                // AUTOMATIC PRICE HISTORY LOGGING
                // This builds the database for your charts every time a search happens
                if (product.id && product.price) {
                    const today = new Date().toISOString().split('T')[0];
                    rtdb.ref(`price_history/${product.id}/${today}`).set(parseFloat(product.price));
                }

                const safeTitle = title.replace(/'/g, "\\'");

                productList.innerHTML += `
                <div class="product-rect-card">
                    <div class="rect-info">
                        <div class="rect-title">${title}</div>
                        <span class="rect-retailer">${product.source || 'Retailer'}</span>
                    </div>
                    <div class="rect-actions">
                        <div class="rect-price">${product.price} SAR</div>
                        <div class="rect-button-group">
                            <a href="${product.link}" target="_blank" class="btn-square-action" title="Visit Store">👁️</a>
                            <button class="btn-square-action" onclick="showPriceHistory('${product.id}', '${safeTitle}')" title="History">📈</button>
                            <button class="btn-square-action" onclick="addToWatchlist('${safeTitle}', ${product.price}, '${product.link}')" title="Watchlist">⭐</button>
                        </div>
                    </div>
                </div>`;
            }
        });

        if (!found) {
            productList.innerHTML = `<div class="empty-state"><p>No products found for "<strong>${query}</strong>".</p></div>`;
        }


        if (currentUser) await addToHistory(query);

        showPage("results");

    } catch (error) {
        console.error("Search Error:", error);
        Swal.fire('Error', 'Failed to retrieve data from Firebase.', 'error');
    } finally {
        toggleLoading(false);
    }
}
// ==========================================
// 5. Price History Logic
// ==========================================
async function showPriceHistory(productId, productName) {
    document.getElementById('history-modal').style.display = 'flex';
    document.getElementById('modal-product-title').innerText = "Price Trend: " + productName;

    const ctx = document.getElementById('priceChart').getContext('2d');
    if (priceChartInstance) priceChartInstance.destroy();

    try {
        const snapshot = await rtdb.ref(`price_history/${productId}`).once("value");
        const historyData = snapshot.val();

        let labels = [];
        let prices = [];

        if (historyData) {
            labels = Object.keys(historyData);
            prices = Object.values(historyData);
        } else {
            labels = ['Today'];
            prices = [0];
        }

        priceChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Price (SAR)',
                    data: prices,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.3
                }]
            }
        });
    } catch (error) {
        console.error(error);
    }
}

function closeModal() {
    document.getElementById('history-modal').style.display = 'none';
}

// ==========================================
// 6. User Features (Watchlist & History)
// ==========================================
async function addToWatchlist(title, price, link) {
    if (!currentUser) {
        Swal.fire('Note', 'Please login first to add products to your watchlist.', 'warning');
        return;
    }
    try {
        await rtdb.ref(`users/${currentUser.uid}/watchlist`).push({
            title, price, link, timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        Swal.fire('Added', 'Product added to your watchlist successfully.', 'success');
        loadUserData(); // Refresh the list instantly
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Failed to add product.', 'error');
    }
}

async function addToHistory(term) {
    if (!currentUser) return;
    try {
        await rtdb.ref(`users/${currentUser.uid}/history`).push({
            term, timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    } catch (e) {
        console.error("Error saving history:", e);
    }
}

function loadUserData() {
    if (!currentUser) return;

    // Load Watchlist
    rtdb.ref(`users/${currentUser.uid}/watchlist`).on('value', snapshot => {
        const box = document.getElementById("watchlist");
        box.innerHTML = "";
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach(key => {
                const item = data[key];
                box.innerHTML += `
                <div class="wish-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
                    <div>
                        <strong>${item.title}</strong><br>
                        <span style="color:var(--primary); font-weight:bold;">${item.price} SAR</span>
                    </div>
                    <a href="${item.link}" target="_blank" class="action-btn btn-store" style="padding:5px 10px; text-decoration:none;">Shop Now</a>
                </div>`;
            });
        } else {
            box.innerHTML = "<p>Your watchlist is empty.</p>";
        }
    });

    // Load Search History
    rtdb.ref(`users/${currentUser.uid}/history`).limitToLast(5).once('value', snapshot => {
        const box = document.getElementById("search-history");
        box.innerHTML = "";
        const data = snapshot.val();
        if (data) {
            Object.values(data).reverse().forEach(item => {
                box.innerHTML += `<span class="history-item" style="cursor:pointer;" onclick="document.getElementById('search-input').value='${item.term}'; performSearch();"><i class="fa fa-history"></i> ${item.term}</span>`;
            });
        } else {
            box.innerHTML = "<p>No recent searches.</p>";
        }
    });
}
