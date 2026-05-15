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
    const targetPage = document.getElementById(id + "-page");
    if (targetPage) targetPage.classList.add("active");
    window.scrollTo(0,0);

    if (id === 'dashboard' && currentUser) {
        loadUserData();
    }
}

function toggleLoading(show) {
    document.getElementById("loader").style.display = show ? "flex" : "none";
}

// ==========================================
// 3. Helper Functions (Deduplication)
// ==========================================
function removeDuplicates(products) {
    const uniqueProducts = [];
    const seenTitles = new Set();

    products.forEach(product => {
        const title = (product.title || product.name || "").trim().toLowerCase();
        if (title && !seenTitles.has(title)) {
            seenTitles.add(title);
            uniqueProducts.push(product);
        }
    });
    return uniqueProducts;
}

// ==========================================
// 4. Core Search Logic (Smart Multi-Word Search)
// ==========================================
async function performSearch() {
    const query = document.getElementById("search-input").value.trim().toLowerCase();
    const productList = document.getElementById("product-list");

    if (!query) {
        Swal.fire('Note', 'Please enter a product name.', 'info');
        return;
    }

    toggleLoading(true);
    productList.className = "results-list-container";
    productList.innerHTML = "";

    try {
        // 1. Fetch data from Firebase
        const [amazonSnap, noonSnap] = await Promise.all([
            rtdb.ref("amazon-products").once("value"),
            rtdb.ref("Noon_products").once("value")
        ]);

        const amazonData = amazonSnap.val() || {};
        const noonData = noonSnap.val() || {};

        // 2. Combine into one list
        const allProducts = [];
        Object.keys(amazonData).forEach(id => allProducts.push({ id, ...amazonData[id], source: 'Amazon' }));
        Object.keys(noonData).forEach(id => allProducts.push({ id, ...noonData[id], source: 'Noon' }));

        // 3. Smart Filter
        const queryWords = query.split(' ').filter(w => w.length > 0);
        const matchedProducts = allProducts.filter(product => {
            const title = (product.title || product.name || "").toLowerCase();
            return queryWords.every(word => title.includes(word));
        });

        // 4. Remove Duplicates
        let uniqueResults = removeDuplicates(matchedProducts);

        // Sort results from cheapest to most expensive
        uniqueResults.sort((a, b) => parseFloat(a.price || 0) - parseFloat(b.price || 0));

        // 5. Render and Auto-log history
        let found = false;

        uniqueResults.forEach((product, index) => {
            found = true;
            const title = product.title || product.name || "";
            const safeTitle = title.replace(/'/g, "\\'");
            const isBestPrice = index === 0;

            // Determine price color based on rank
            let priceColor = '#333'; // Default
            if (index === 0) {
                priceColor = '#10b981'; // Green (Cheapest)
            } else if (index === uniqueResults.length - 1 && uniqueResults.length > 1) {
                priceColor = '#ef4444'; // Red (Most Expensive)
            } else {
                priceColor = '#f59e0b'; // Orange (Average)
            }

            // Auto-update price history for charting
            if (product.id && product.price) {
                const today = new Date().toISOString().split('T')[0];
                rtdb.ref(`price_history/${product.id}/${today}`).set(parseFloat(product.price));
            }

            const imageUrl = product.image_url || '';

            productList.innerHTML += `
            <div class="product-rect-card" style="position: relative; flex-direction: column;">

                ${isBestPrice ? '<span class="best-price-badge" style="position:absolute; top:-12px; right:15px; background-color:#10b981; color:white; padding:4px 12px; border-radius:20px; font-size:0.8rem; font-weight:bold; box-shadow:0 2px 8px rgba(16,185,129,0.4);"><i class="fas fa-tag"></i> Best Price</span>' : ''}

                <div style="display: flex; width: 100%; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                    ${imageUrl ? `
                    <div class="rect-image-wrapper">
                        <img src="${imageUrl}" alt="${title}" class="rect-product-img"
                             onerror="this.parentElement.style.display='none'">
                    </div>` : ''}



                    <div class="rect-info" style="flex: 1;">
                        <span class="retailer-label" style="display:inline-block; background:#f0fdf4; color:#064e3b; padding:3px 10px; border-radius:6px; font-size:0.85rem; font-weight:700; margin-bottom:8px; border:1px solid #d1fae5;">
                            ${product.source || 'Retailer'}
                        </span>
                        <div class="rect-title" style="margin-top: 5px;">${title}</div>
                    </div>

                    <div class="rect-actions">
                        <div class="rect-price" style="color: ${priceColor}; font-weight: 800; font-size: 1.1rem;">${product.price} SAR</div>
                        <div class="rect-button-group">
                            <a href="${product.link}" target="_blank" class="btn-square-action" title="Visit Store">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i>
                            </a>
                            <button class="btn-square-action" onclick="showPriceHistory('${product.id}', '${safeTitle}')" title="Price History">
                                <i class="fa-solid fa-chart-line"></i>
                            </button>
                            <button class="btn-square-action" onclick="addToWatchlist('${safeTitle}', ${product.price}, '${product.link}')" title="Add to Watchlist">
                                <i class="fa-regular fa-star"></i>
                            </button>
                            <button class="btn-square-action" onclick="setPriceAlert('${product.id}', ${product.price})" title="Price Alert">
                                <i class="fa-regular fa-bell"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
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
// 5. Price History Logic (Charting) & Alerts
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
            console.log(`Firebase Data for ${productId}:`, historyData);

            // 1. If data is an Array
            if (Array.isArray(historyData)) {
                historyData.forEach(item => {
                    if (item && item.date && item.price) {
                        labels.push(item.date);
                        prices.push(parseFloat(item.price));
                    }
                });
            }
            // 2. If data is an Object
            else if (typeof historyData === 'object') {
                labels = Object.keys(historyData).sort();
                prices = labels.map(key => {
                    let val = historyData[key];
                    if (typeof val === 'object' && val !== null && val.price !== undefined) {
                        return parseFloat(val.price);
                    }
                    return parseFloat(val);
                });
            }
        }

        if (labels.length === 0) {
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
        console.error("Error drawing chart:", error);
    }
}

function closeModal() {
    document.getElementById('history-modal').style.display = 'none';
}

async function setPriceAlert(productId, currentPrice) {
    if (!currentUser) {
        Swal.fire('Alert', 'You must log in first to enable price alerts.', 'warning');
        return;
    }

    const { value: targetPrice } = await Swal.fire({
        title: 'Price Drop Alert',
        input: 'number',
        inputLabel: `Current Price: ${currentPrice} SAR`,
        inputPlaceholder: 'Enter the target price...',
        showCancelButton: true,
        confirmButtonText: 'Set Alert',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#10b981'
    });

    if (targetPrice) {
        try {
            await rtdb.ref(`users/${currentUser.uid}/alerts/${productId}`).set({
                targetPrice: parseFloat(targetPrice),
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });
            Swal.fire('Activated!', `We will alert you when the price drops to ${targetPrice} SAR.`, 'success');
        } catch (error) {
            Swal.fire('Error', 'An error occurred while saving the alert.', 'error');
        }
    }
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
    } catch (e) {
        Swal.fire('Error', 'Failed to add product.', 'error');
    }
}

async function addToHistory(term) {
    if (!currentUser) return;
    try {
        await rtdb.ref(`users/${currentUser.uid}/history`).push({
            term, timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    } catch (e) { console.error(e); }
}

function loadUserData() {
    if (!currentUser) return;

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

function clearHistory() {
    if (currentUser) {
        rtdb.ref(`users/${currentUser.uid}/history`).remove();
        document.getElementById("search-history").innerHTML = "<p>No recent searches.</p>";
    }
}

// ==========================================
// 7. Authentication Logic
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
