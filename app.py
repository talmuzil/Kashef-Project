"""
Kashef AI - FREE AI Product Matching (Improved Accuracy)
Hybrid AI + Keyword Matching + Smart Filtering + Price History
"""

from flask import Flask, render_template, request, jsonify, send_from_directory
import pandas as pd
import re
import os
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer
import warnings
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, db

warnings.filterwarnings('ignore')

# ============================================
# INIT
# ============================================
app = Flask(__name__)
print("🚀 Loading AI Model...")

model = SentenceTransformer('all-MiniLM-L6-v2')

print("✅ AI Model loaded!")

# ============================================
# PRICE HISTORY LOGGING (NEW)
# ============================================
def log_price_to_history(product_id, price):
    """Saves a daily snapshot of the price to Firebase."""
    if not product_id or pd.isna(product_id):
        return

    try:
        today = datetime.now().strftime('%Y-%m-%d')
        # Path: price_history / product_id / 2024-05-20
        history_ref = db.reference(f"price_history/{product_id}")
        history_ref.update({
            today: float(price)
        })
    except Exception as e:
        print(f"⚠️ History Log Error: {e}")

# ============================================
# TEXT PROCESSING
# ============================================
def preprocess_text(text):
    if not isinstance(text, str):
        return ""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s\-\.]', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def create_search_text(row):
    name_val = str(row.get('title', row.get('name', '')))
    desc_val = str(row.get('description', ''))
    brand_val = str(row.get('brand', ''))

    parts = [p for p in [name_val, desc_val, brand_val] if p and pd.notna(p)]
    return preprocess_text(' '.join(parts))


# ============================================
# AI + KEYWORD MATCHING
# ============================================
def ai_semantic_similarity(source_text, target_texts):
    if not source_text or not target_texts:
        return [0.0] * len(target_texts)

    try:
        source_emb = model.encode([source_text])
        target_emb = model.encode(target_texts)
        return cosine_similarity(source_emb, target_emb)[0].tolist()
    except:
        return [0.0] * len(target_texts)


def keyword_score(source_text, target_text):
    source_words = set(source_text.split())
    target_words = set(target_text.split())

    if not source_words:
        return 0

    common = source_words.intersection(target_words)
    return len(common) / len(source_words)


# ============================================
# MAIN MATCHING FUNCTION (UPDATED WITH HISTORY)
# ============================================
def match_products(source_df, target_df, top_k=5):
    results = []

    if target_df.empty or source_df.empty:
        return pd.DataFrame()

    target_df = target_df.copy()
    target_df['search_text'] = target_df.apply(create_search_text, axis=1)

    source_df = source_df.copy()
    source_df['search_text'] = source_df.apply(create_search_text, axis=1)

    target_texts = target_df['search_text'].tolist()

    # Pre-caching target data for faster access
    target_data = []
    for _, row in target_df.iterrows():
        target_data.append({
            'id': row.get('id', ''),
            'name': row.get('name', ''),
            'price': row.get('price', 0),
            'retailer': row.get('retailer', ''),
            'url': row.get('url', ''),
            'brand': row.get('brand', '')
        })

    for _, row in source_df.iterrows():
        source_name = row.get('title', row.get('name', ''))
        source_price = row.get('price', 0)
        source_brand = row.get('brand', '')
        source_text = row['search_text']

        word_count = len(source_text.split())
        if word_count <= 2: dynamic_threshold = 0.3
        elif word_count <= 4: dynamic_threshold = 0.45
        else: dynamic_threshold = 0.6

        ai_scores = ai_semantic_similarity(source_text, target_texts)

        combined_scores = []
        for i, target_text in enumerate(target_texts):
            kw_score = keyword_score(source_text, target_text)
            final_score = 0.7 * ai_scores[i] + 0.3 * kw_score
            combined_scores.append(final_score)

        score_pairs = sorted([(s, i) for i, s in enumerate(combined_scores)], reverse=True)

        for score, idx in score_pairs[:top_k]:
            if score < dynamic_threshold:
                continue

            target = target_data[idx]

            # --- START HISTORY UPDATE ---
            product_id = target['id']
            current_target_price = float(target['price']) if target['price'] else 0.0

            # Log the price to Firebase for history tracking
            log_price_to_history(product_id, current_target_price)
            # --- END HISTORY UPDATE ---

            try:
                price_diff = round(current_target_price - float(source_price), 2)
            except:
                price_diff = 0.0

            results.append({
                'id': product_id, # Crucial for frontend chart lookups
                'source_name': source_name,
                'source_price': float(source_price) if source_price else 0.0,
                'source_brand': source_brand,
                'target_name': target['name'],
                'target_price': current_target_price,
                'target_retailer': target['retailer'],
                'target_url': target['url'],
                'ai_similarity': round(score, 4),
                'confidence': '🟢 High' if score >= 0.7 else '🟡 Medium' if score >= 0.4 else '🟠 Low',
                'price_diff': price_diff
            })

    df = pd.DataFrame(results)
    if df.empty: return df

    df = df.sort_values(by=['source_name', 'ai_similarity', 'target_price'], ascending=[True, False, True])

    final_results = []
    grouped = df.groupby('source_name')
    for source, group in grouped:
        top_matches = group.head(5)
        top_matches = top_matches.sort_values(by='target_price')
        final_results.append(top_matches)

    return pd.concat(final_results)


# ============================================
# LOAD DATA
# ============================================
def load_retailer_products():
    csv_path = os.path.join('data', 'retailer_products.csv')
    try:
        if os.path.exists(csv_path):
            df = pd.read_csv(csv_path, quotechar='"')
            rename_map = {'title': 'name', 'source': 'retailer', 'link': 'url'}
            df = df.rename(columns=rename_map)

            for col in ['id', 'name', 'description', 'retailer', 'brand', 'category', 'price', 'url']:
                if col not in df.columns:
                    df[col] = ''

            df['price'] = pd.to_numeric(df['price'], errors='coerce')
            return df[['id', 'name', 'description', 'retailer', 'brand', 'price', 'url']]
    except Exception as e:
        print(f"⚠️ Error loading CSV: {e}")
    return pd.DataFrame()


# ============================================
# ROUTES
# ============================================
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/match', methods=['POST'])
def api_match():
    try:
        data = request.get_json()
        products = data.get('products', [])
        if not products: return jsonify({'error': 'No products'}), 400

        df_source = pd.DataFrame(products)
        df_retailer = load_retailer_products()
        results = match_products(df_source, df_retailer)

        return jsonify({
            'success': True,
            'results': results.to_dict('records') if not results.empty else [],
            'total_matches': len(results) if not results.empty else 0
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
