"""
Kashef AI - FREE AI Product Matching (Improved Accuracy)
Hybrid AI + Keyword Matching + Smart Filtering
"""

from flask import Flask, render_template, request, jsonify, send_from_directory
import pandas as pd
import re
import os
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer
import warnings
warnings.filterwarnings('ignore')

# ============================================

# INIT
# ============================================
app = Flask(__name__)
print("🚀 Loading AI Model...")

model = SentenceTransformer('all-MiniLM-L6-v2')

print("✅ AI Model loaded!")

# ============================================
# TEXT PROCESSING
# ============================================
def preprocess_text(text):
    if not isinstance(text, str):
        return ""
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9\s\-\.]', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def create_search_text(row):
    parts = [str(row.get(col, '')) for col in ['name', 'description', 'brand'] if pd.notna(row.get(col))]
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
# MAIN MATCHING FUNCTION
# ============================================
def match_products(source_df, target_df, top_k=5):
    results = []

    target_df = target_df.copy()
    target_df['search_text'] = target_df.apply(create_search_text, axis=1)

    source_df = source_df.copy()
    source_df['search_text'] = source_df.apply(create_search_text, axis=1)

    target_texts = target_df['search_text'].tolist()
    target_data = target_df[['id', 'name', 'price', 'retailer', 'url', 'brand']].to_dict('records')

    for _, row in source_df.iterrows():
        source_name = row['name']
        source_price = row.get('price', 0)
        source_brand = row.get('brand', '')
        source_text = row['search_text']

        # 🔥 Dynamic threshold
        word_count = len(source_text.split())

        if word_count <= 2:
            dynamic_threshold = 0.3
        elif word_count <= 4:
            dynamic_threshold = 0.45
        else:
            dynamic_threshold = 0.6

        # AI similarity
        ai_scores = ai_semantic_similarity(source_text, target_texts)

        # Hybrid scoring
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

            results.append({
                'source_name': source_name,
                'source_price': float(source_price),
                'source_brand': source_brand,
                'target_name': target['name'],
                'target_price': float(target['price']),
                'target_retailer': target['retailer'],
                'target_url': target['url'],
                'ai_similarity': round(score, 4),
                'confidence': '🟢 High' if score >= 0.7 else '🟡 Medium' if score >= 0.4 else '🟠 Low',
                'price_diff': round(float(target['price']) - float(source_price), 2)
            })

    df = pd.DataFrame(results)

    if df.empty:
        return df

    # 🔥 Sort by similarity first, then price
    df = df.sort_values(by=['source_name', 'ai_similarity', 'target_price'],
                        ascending=[True, False, True])

    # 🔥 Keep only cheapest per similar product name
    final_results = []

    grouped = df.groupby('source_name')

    for source, group in grouped:
        # Take top matches (already sorted)
        top_matches = group.head(5)

        # 🔥 Sort those by price (cheapest first)
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

            if len(df.columns) >= 8:
                df.columns = ['id','name','description','retailer','brand','category','price','url']

            df['price'] = pd.to_numeric(df['price'], errors='coerce')

            print(f"✅ Loaded {len(df)} products from CSV")
            return df[['id','name','description','retailer','brand','price','url']]

    except:
        print("⚠️ Error loading CSV")

    return pd.DataFrame()


# ============================================
# ROUTES
# ============================================
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory('static', filename)


@app.route('/api/match', methods=['POST'])
def api_match():
    try:
        data = request.get_json()
        products = data.get('products', [])

        if not products:
            return jsonify({'error': 'No products'}), 400

        df_source = pd.DataFrame(products)
        df_retailer = load_retailer_products()

        results = match_products(df_source, df_retailer)

        return jsonify({
            'success': True,
            'results': results.to_dict('records'),
            'total_matches': len(results)
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/health')
def health():
    return jsonify({'status': 'healthy'})


@app.route('/api/products')
def api_products():
    df = load_retailer_products()
    return jsonify({
        'success': True,
        'products': df.to_dict('records'),
        'total': len(df)
    })


#
# ============================================
# RUN
# ============================================
if __name__ == '__main__':
    print("="*60)
    print("🤖 KASHEF AI - SMART MATCHING")
    print("🌐 http://localhost:5000")
    print("="*60)
    app.run(debug=True, port=5000)