// ========== Firebase設定 ==========
const firebaseConfig = {
    apiKey: "AIzaSyD40rFptPsrU7tX3Mcv0l04BuKGdozGies",
    authDomain: "keiri-tool-bc599.firebaseapp.com",
    projectId: "keiri-tool-bc599",
    storageBucket: "keiri-tool-bc599.firebasestorage.app",
    messagingSenderId: "15125801388",
    appId: "1:15125801388:web:60f0e1fe484b8cb938b209"
};

// Firebase初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// 現在のユーザー情報
let currentUser = null;
let isAdmin = false;
let isApproved = false;

// グローバル変数
let transactions = [];
let currentImageData = null;
let currentImageUrl = null;
let currentFilters = {
    year: '',
    month: '',
    type: '',
    keyword: ''
};

// ローカルストレージのキー（APIキーなど個人設定用）
const STORAGE_KEY = 'keiri_transactions';
const PAYMENT_DETAILS_KEY = 'keiri_payment_details';
const GEMINI_API_KEY = 'keiri_gemini_api_key';

// カスタム支払い詳細の選択肢（使用回数付き）
// 形式: { name: "楽天カード", count: 5 }
let paymentDetailOptions = [];

// Gemini APIキー
let geminiApiKey = null;

// Firestoreのリアルタイムリスナー解除用
let unsubscribeFirestore = null;

// DOMロード時の初期化
document.addEventListener('DOMContentLoaded', () => {
    setupAuth();  // 認証を最初にセットアップ
    loadTransactions();
    loadPaymentDetailOptions();
    loadGeminiApiKey();
    updateYearOptions();
    updateMonthOptions();
    updateTypeOptions();
    renderTransactionList();
    setupEventListeners();
    setupFormValidation();
    setupFilterListeners();
    setupApiSettingsListeners();
    setupMemoSuggestion();
});

// フォームバリデーションの設定（日本語メッセージ）
function setupFormValidation() {
    const dateInput = document.getElementById('date');
    const amountInput = document.getElementById('amount');
    const purposeInput = document.getElementById('purpose');
    const paymentMethodSelect = document.getElementById('paymentMethod');

    // 日付の必須チェック
    dateInput.addEventListener('invalid', function() {
        this.setCustomValidity('日付を選択してください');
    });
    dateInput.addEventListener('input', function() {
        this.setCustomValidity('');
        // 入力したら赤→緑に変更
        const group = this.closest('.form-group');
        if (this.value) {
            group.classList.remove('needs-input');
            group.classList.add('filled');
        }
    });
    dateInput.addEventListener('change', function() {
        // 日付ピッカーで選択した場合も対応
        const group = this.closest('.form-group');
        if (this.value) {
            group.classList.remove('needs-input');
            group.classList.add('filled');
        }
    });

    // 金額の必須チェックと数値チェック
    amountInput.addEventListener('invalid', function() {
        if (this.value === '') {
            this.setCustomValidity('金額を入力してください');
        } else if (this.value <= 0) {
            this.setCustomValidity('金額は1円以上で入力してください');
        }
    });
    amountInput.addEventListener('input', function() {
        this.setCustomValidity('');
        if (this.value <= 0 && this.value !== '') {
            this.setCustomValidity('金額は1円以上で入力してください');
        }
        // 入力したら赤→緑に変更
        const group = this.closest('.form-group');
        if (this.value && this.value > 0) {
            group.classList.remove('needs-input');
            group.classList.add('filled');
        }
    });

    // 用途の必須チェック
    purposeInput.addEventListener('invalid', function() {
        this.setCustomValidity('用途を入力してください');
    });
    purposeInput.addEventListener('input', function() {
        this.setCustomValidity('');
        // 入力したら赤→緑に変更
        const group = this.closest('.form-group');
        if (this.value) {
            group.classList.remove('needs-input');
            group.classList.add('filled');
        }
    });

    // 支払い方法の必須チェック
    paymentMethodSelect.addEventListener('invalid', function() {
        this.setCustomValidity('支払い方法を選択してください');
    });
    paymentMethodSelect.addEventListener('change', function() {
        this.setCustomValidity('');
        // 選択したら赤→緑に変更
        const group = this.closest('.form-group');
        if (this.value) {
            group.classList.remove('needs-input');
            group.classList.add('filled');
        }
    });
}

// イベントリスナーの設定
function setupEventListeners() {
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    const form = document.getElementById('transactionForm');
    const cancelBtn = document.getElementById('cancelBtn');
    const exportBtn = document.getElementById('exportBtn');
    const backupBtn = document.getElementById('backupBtn');
    const restoreBtn = document.getElementById('restoreBtn');
    const restoreFileInput = document.getElementById('restoreFileInput');

    // ファイル選択
    fileInput.addEventListener('change', handleFileSelect);

    // ドラッグ＆ドロップ
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });

    // フォーム送信
    form.addEventListener('submit', handleFormSubmit);

    // キャンセルボタン
    cancelBtn.addEventListener('click', resetForm);

    // エクスポートボタン
    exportBtn.addEventListener('click', exportToExcel);

    // バックアップボタン
    backupBtn.addEventListener('click', backupData);

    // 復元ボタン
    restoreBtn.addEventListener('click', () => {
        restoreFileInput.click();
    });

    // 復元ファイル選択
    restoreFileInput.addEventListener('change', restoreData);
}

// フィルターのイベントリスナー設定
function setupFilterListeners() {
    const filterYear = document.getElementById('filterYear');
    const filterMonth = document.getElementById('filterMonth');
    const filterType = document.getElementById('filterType');
    const searchKeyword = document.getElementById('searchKeyword');
    const clearFilterBtn = document.getElementById('clearFilterBtn');

    filterYear.addEventListener('change', () => {
        currentFilters.year = filterYear.value;
        // 年が変わったら月の選択肢を更新（その年のデータがある月のみ表示）
        updateMonthOptions();
        currentFilters.month = '';  // 月のフィルターをリセット
        filterMonth.value = '';
        renderTransactionList();
    });

    filterMonth.addEventListener('change', () => {
        currentFilters.month = filterMonth.value;
        renderTransactionList();
    });

    filterType.addEventListener('change', () => {
        currentFilters.type = filterType.value;
        renderTransactionList();
    });

    searchKeyword.addEventListener('input', () => {
        currentFilters.keyword = searchKeyword.value;
        renderTransactionList();
    });

    clearFilterBtn.addEventListener('click', () => {
        filterYear.value = '';
        filterMonth.value = '';
        filterType.value = '';
        searchKeyword.value = '';
        currentFilters = { year: '', month: '', type: '', keyword: '' };
        updateMonthOptions();  // 全データの月を表示
        updateTypeOptions();   // 全データの種別を表示
        renderTransactionList();
    });
}

// ファイル選択処理
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        handleFile(file);
    }
}

// ファイル処理
async function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('画像ファイルを選択してください');
        return;
    }

    // 画像プレビュー表示
    const reader = new FileReader();
    reader.onload = async (e) => {
        const originalImageUrl = e.target.result;
        showImagePreview(originalImageUrl);

        // Base64データを取得（data:image/...;base64, の部分を除く）
        currentImageData = originalImageUrl.split(',')[1];

        // オリジナル画像でOCR解析（精度を保つため）
        await analyzeReceipt(currentImageData);

        // OCR後に画像を圧縮して保存用に設定（容量節約）
        currentImageUrl = await compressImage(originalImageUrl);
        console.log('画像圧縮完了:', Math.round(originalImageUrl.length / 1024) + 'KB →', Math.round(currentImageUrl.length / 1024) + 'KB');
    };
    reader.readAsDataURL(file);
}

// 画像を圧縮（OCR後に実行、保存用）
function compressImage(dataUrl, maxWidth = 800, quality = 0.7) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // 最大幅を超える場合はリサイズ
            if (width > maxWidth) {
                height = Math.round(height * maxWidth / width);
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // JPEG形式で圧縮（qualityで品質調整）
            const compressedUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedUrl);
        };
        img.src = dataUrl;
    });
}

// 画像プレビュー表示
function showImagePreview(imageUrl) {
    const previewArea = document.getElementById('previewArea');
    previewArea.innerHTML = `<img src="${imageUrl}" alt="領収書プレビュー">`;
}

// 領収書を解析（Gemini API優先、なければTesseract.js）
async function analyzeReceipt(imageData) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const formSection = document.getElementById('formSection');

    loadingIndicator.classList.remove('hidden');

    try {
        let extractedData;

        if (geminiApiKey) {
            // Gemini APIで解析
            console.log('Gemini APIで解析中...');
            extractedData = await analyzeWithGemini(imageData);
        } else {
            // Tesseract.jsで解析（フォールバック）
            console.log('Tesseract.jsで解析中...');
            extractedData = await analyzeWithTesseract();
        }

        fillFormWithExtractedData(extractedData);

    } catch (error) {
        console.error('Error:', error);
        alert('画像の解析に失敗しました。手動で入力してください。\nエラー: ' + error.message);
        setTodayDate();
    } finally {
        loadingIndicator.classList.add('hidden');
        formSection.classList.remove('hidden');
    }
}

// Gemini APIで画像解析
async function analyzeWithGemini(imageData) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

    const prompt = `この領収書/レシート画像から以下の情報を抽出してください。
JSON形式で回答してください（他の文章は不要）:
{
  "date": "YYYY-MM-DD形式の日付",
  "amount": 数字のみ（カンマなし）,
  "purpose": "店舗名や用途",
  "paymentMethod": "現金" or "クレジットカード" or "銀行振込" or "その他"
}

読み取れない項目はnullにしてください。`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: 'image/jpeg',
                            data: imageData
                        }
                    }
                ]
            }]
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Gemini APIエラー');
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('Gemini応答:', responseText);

    // JSONを抽出
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                date: parsed.date || null,
                amount: parsed.amount ? String(parsed.amount) : null,
                purpose: parsed.purpose || null,
                paymentMethod: parsed.paymentMethod || null
            };
        } catch (e) {
            console.error('JSON解析エラー:', e);
        }
    }

    // JSONが取れなかった場合はTesseractにフォールバック
    console.log('Gemini応答をパースできません。Tesseractにフォールバック...');
    return await analyzeWithTesseract();
}

// Tesseract.jsで画像解析
async function analyzeWithTesseract() {
    const { data: { text } } = await Tesseract.recognize(
        currentImageUrl,
        'jpn',
        {
            logger: info => {
                console.log(info);
            }
        }
    );

    console.log('OCR結果:', text);
    return extractDataFromText(text);
}

// OCRで取得したテキストから情報を抽出
function extractDataFromText(text) {
    const result = {
        date: null,
        amount: null,
        purpose: null,
        paymentMethod: null
    };

    // 日付を抽出（YYYY年MM月DD日、YYYY/MM/DD、YYYY-MM-DD など）
    const datePatterns = [
        /振込予定日[：:\s]*(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})[日]?/,  // 銀行振込
        /振込日[：:\s]*(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})[日]?/,  // 銀行振込
        /注文日[:\s]*(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})[日]?/,  // Amazon領収書
        /(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})[日]?/,
        /(\d{4})\.(\d{1,2})\.(\d{1,2})/
    ];

    for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
            const year = match[1];
            const month = match[2].padStart(2, '0');
            const day = match[3].padStart(2, '0');
            result.date = `${year}-${month}-${day}`;
            break;
        }
    }

    // 金額を抽出（¥や円を含む数値）
    const amountPatterns = [
        // 銀行振込: 振込金額: 4,244円 形式
        /振込金額[：:\s]*([0-9,]+)\s*円/,
        /振込額[：:\s]*([0-9,]+)\s*円/,
        // Amazon領収書: 注文合計: ¥12,698 形式
        /注文合計[：:\s]*[¥￥]\s*([0-9,]+)/,
        /ご請求額[：:\s]*[¥￥]\s*([0-9,]+)/,
        // 一般的な形式
        /[¥￥]\s*([0-9,]+)\s*円?/,  // ¥12,698 または ¥12,698円
        /合計[：:\s]*[¥￥]?\s*([0-9,]+)/,
        /小計[：:\s]*[¥￥]?\s*([0-9,]+)/,
        /金額[：:\s]*[¥￥]?\s*([0-9,]+)/,
        /([0-9,]+)\s*円/  // 12,698円
    ];

    for (const pattern of amountPatterns) {
        const match = text.match(pattern);
        if (match) {
            result.amount = match[1].replace(/,/g, '');
            break;
        }
    }

    // 支払い方法を判定
    // 銀行振込を最優先でチェック（振込完了画面など）
    const isBankTransfer = text.includes('振込') || text.includes('振り込み') ||
                           text.includes('振込金額') || text.includes('振込予定日') ||
                           text.includes('振込手数料') || text.includes('受取人');

    // Amazon領収書: ギフトカード + クレジットカードの組み合わせが多い
    const hasGiftCard = text.includes('ギフトカード') || text.includes('ギフト券') || text.includes('Amazonギフト');
    const hasCreditCard = text.includes('クレジット') || text.includes('カード') ||
                          text.includes('VISA') || text.includes('Visa') ||
                          text.includes('Master') || text.includes('JCB') ||
                          text.includes('AMEX') || text.includes('Diners');

    if (isBankTransfer) {
        // 銀行振込画面
        result.paymentMethod = '銀行振込';
    } else if (text.includes('現金') || text.includes('CASH')) {
        result.paymentMethod = '現金';
    } else if (hasGiftCard && hasCreditCard) {
        // Amazon領収書: ギフトカード + クレジットカード併用
        result.paymentMethod = 'クレジットカード';  // 主要な支払い方法として
    } else if (hasGiftCard) {
        result.paymentMethod = 'その他';  // ギフトカードのみ
    } else if (hasCreditCard) {
        result.paymentMethod = 'クレジットカード';
    } else if (text.includes('Amazon') || text.includes('amazon')) {
        // Amazon領収書だが支払い方法が特定できない場合
        result.paymentMethod = 'クレジットカード';  // デフォルト
    }

    // 用途（出金先・店舗名）を判定
    // 銀行振込の場合は受取人名を用途として抽出
    if (isBankTransfer) {
        // 受取人名を抽出: 「受取人名: カ)ペ イディ イー」などの形式
        const recipientPatterns = [
            /受取人名[：:\s]*(.+?)(?:\n|$)/,
            /受取人[：:\s]*(.+?)(?:\n|$)/,
            /振込先[：:\s]*(.+?)(?:\n|$)/,
        ];
        for (const pattern of recipientPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                result.purpose = match[1].trim();
                break;
            }
        }
        // 受取人名が取れなかった場合、金融機関名を使う
        if (!result.purpose) {
            const bankPatterns = [
                /金融機関[：:\s]*(.+?)(?:\n|$)/,
                /振込先金融機関[：:\s]*(.+?)(?:\n|$)/,
                /([\w]+銀行)/,
                /([\w]+ネット銀行)/,
            ];
            for (const pattern of bankPatterns) {
                const match = text.match(pattern);
                if (match && match[1]) {
                    result.purpose = '振込: ' + match[1].trim();
                    break;
                }
            }
        }
    }

    // 銀行振込でない場合、または受取人名が取れなかった場合、店舗名を探す
    // まず有名なサービス・店舗を直接チェック
    const knownStores = [
        { pattern: /Amazon|アマゾン/i, name: 'Amazon' },
        { pattern: /楽天市場|Rakuten/i, name: '楽天市場' },
        { pattern: /ヤフー|Yahoo/i, name: 'Yahoo!ショッピング' },
        { pattern: /メルカリ|mercari/i, name: 'メルカリ' },
        { pattern: /コンビニ|セブン|ファミマ|ローソン|7-ELEVEN|FamilyMart|LAWSON/i, name: (m) => {
            if (/セブン|7-ELEVEN/i.test(m)) return 'セブンイレブン';
            if (/ファミマ|FamilyMart/i.test(m)) return 'ファミリーマート';
            if (/ローソン|LAWSON/i.test(m)) return 'ローソン';
            return 'コンビニ';
        }},
        { pattern: /スターバックス|Starbucks|スタバ/i, name: 'スターバックス' },
        { pattern: /マクドナルド|McDonald/i, name: 'マクドナルド' },
        { pattern: /吉野家/i, name: '吉野家' },
        { pattern: /松屋/i, name: '松屋' },
        { pattern: /すき家/i, name: 'すき家' },
        { pattern: /ガソリン|エネオス|ENEOS|出光|シェル|Shell/i, name: 'ガソリンスタンド' },
        { pattern: /ドンキ|ドン・キホーテ/i, name: 'ドン・キホーテ' },
        { pattern: /イオン|AEON/i, name: 'イオン' },
        { pattern: /ユニクロ|UNIQLO/i, name: 'ユニクロ' },
        { pattern: /ダイソー|DAISO/i, name: 'ダイソー' },
        { pattern: /ヤマダ電機|ヤマダデンキ/i, name: 'ヤマダ電機' },
        { pattern: /ビックカメラ|BicCamera/i, name: 'ビックカメラ' },
        { pattern: /ヨドバシ/i, name: 'ヨドバシカメラ' },
    ];

    for (const store of knownStores) {
        const match = text.match(store.pattern);
        if (match) {
            result.purpose = typeof store.name === 'function' ? store.name(text) : store.name;
            break;
        }
    }

    // 有名店舗が見つからなかった場合、テキストから店名を探す
    if (!result.purpose) {
        const lines = text.split('\n').filter(line => line.trim());
        // 「店」「ストア」「株式会社」などを含む行を探す
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.match(/店|ストア|株式会社|有限会社|合同会社|商店|販売/)) {
                if (trimmed.length > 2 && trimmed.length < 40) {
                    result.purpose = trimmed;
                    break;
                }
            }
        }
    }

    // それでも見つからない場合、最初の意味のある行を使う
    if (!result.purpose) {
        const lines = text.split('\n').filter(line => line.trim());
        for (let i = 0; i < Math.min(5, lines.length); i++) {
            const line = lines[i].trim();
            // 日付や金額ではない、ある程度の長さのテキストを用途として使用
            if (line.length > 2 && line.length < 50 &&
                !line.match(/\d{4}[年\/\-]/) &&
                !line.match(/[¥￥]\d/) &&
                !line.match(/^\d+$/) &&
                !line.match(/^(領収書|レシート|明細|注文)/)) {
                result.purpose = line;
                break;
            }
        }
    }

    return result;
}

// 抽出データをフォームに入力
function fillFormWithExtractedData(data) {
    let missingFields = [];

    // 各フィールドの親要素（form-group）を取得
    const dateGroup = document.getElementById('date').closest('.form-group');
    const amountGroup = document.getElementById('amount').closest('.form-group');
    const purposeGroup = document.getElementById('purpose').closest('.form-group');
    const paymentMethodGroup = document.getElementById('paymentMethod').closest('.form-group');

    // リセット
    [dateGroup, amountGroup, purposeGroup, paymentMethodGroup].forEach(group => {
        group.classList.remove('needs-input', 'filled');
    });

    // 日付
    if (data.date) {
        document.getElementById('date').value = data.date;
        dateGroup.classList.add('filled');
    } else {
        setTodayDate();
        dateGroup.classList.add('needs-input');
        missingFields.push('日付');
    }

    // 金額
    if (data.amount) {
        document.getElementById('amount').value = data.amount;
        amountGroup.classList.add('filled');
    } else {
        amountGroup.classList.add('needs-input');
        missingFields.push('金額');
    }

    // 用途
    if (data.purpose) {
        document.getElementById('purpose').value = data.purpose;
        purposeGroup.classList.add('filled');
    } else {
        purposeGroup.classList.add('needs-input');
        missingFields.push('用途');
    }

    // 支払い方法
    if (data.paymentMethod) {
        document.getElementById('paymentMethod').value = data.paymentMethod;
        paymentMethodGroup.classList.add('filled');
    } else {
        paymentMethodGroup.classList.add('needs-input');
        missingFields.push('支払い方法');
    }

    // 読み取れなかった項目を通知
    if (missingFields.length > 0) {
        alert(`以下の項目を自動で読み取れませんでした。赤い項目を入力してください：\n\n${missingFields.join('、')}`);
    } else {
        alert('領収書を全て自動で読み取りました！内容を確認して保存してください。');
    }
}

// 今日の日付を設定
function setTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').value = today;
}

// フォーム送信処理
async function handleFormSubmit(event) {
    event.preventDefault();

    const paymentDetail = getPaymentDetailValue();

    const transaction = {
        id: editingTransactionId || Date.now(),
        date: document.getElementById('date').value,
        amount: parseInt(document.getElementById('amount').value),
        purpose: document.getElementById('purpose').value,
        paymentMethod: document.getElementById('paymentMethod').value,
        paymentDetail: paymentDetail,
        transactionType: document.getElementById('transactionType').value,
        notes: document.getElementById('notes').value,
        imageUrl: currentImageUrl,
        createdAt: editingTransactionId
            ? transactions.find(t => t.id === editingTransactionId)?.createdAt || new Date().toISOString()
            : new Date().toISOString(),
        updatedAt: editingTransactionId ? new Date().toISOString() : null
    };

    // 新しい支払い詳細を選択肢に追加（次回から選べるように）
    if (paymentDetail) {
        addPaymentDetailOption(paymentDetail);
    }

    // 即時表示：ローカル配列に追加して即座に表示
    if (editingTransactionId) {
        // 編集の場合は既存を置き換え
        const index = transactions.findIndex(t => t.id === editingTransactionId);
        if (index !== -1) {
            transactions[index] = transaction;
        }
    } else {
        // 新規の場合は先頭に追加
        transactions.unshift(transaction);
    }
    renderTransactionList();

    // Firestoreに保存（バックグラウンドで同期）
    saveTransactionToFirestore(transaction);

    if (editingTransactionId) {
        alert('取引を更新しました！');
    } else {
        alert('取引を保存しました！');
    }

    resetForm();
}

// フォームリセット
function resetForm() {
    document.getElementById('transactionForm').reset();
    document.getElementById('formSection').classList.add('hidden');
    document.getElementById('previewArea').innerHTML = '';
    currentImageData = null;
    currentImageUrl = null;

    // 編集モードをクリア
    editingTransactionId = null;
    document.querySelector('#formSection h2').textContent = '取引情報';

    // 新規入力欄を非表示に
    document.getElementById('paymentDetailNew').classList.add('hidden');
    document.getElementById('paymentDetailNew').value = '';

    // 色のリセット
    const formGroups = document.querySelectorAll('.form-group');
    formGroups.forEach(group => {
        group.classList.remove('needs-input', 'filled');
    });
}

// 取引一覧を表示（フィルター対応）
function renderTransactionList() {
    const listContainer = document.getElementById('transactionList');
    const filterSummary = document.getElementById('filterSummary');

    if (transactions.length === 0) {
        listContainer.innerHTML = '<p class="empty-message">まだ記録がありません</p>';
        filterSummary.classList.add('hidden');
        return;
    }

    // フィルター適用
    let filteredTransactions = transactions.filter(transaction => {
        // 年でフィルター
        if (currentFilters.year && !transaction.date.startsWith(currentFilters.year)) {
            return false;
        }

        // 月でフィルター
        if (currentFilters.month) {
            const transactionMonth = transaction.date.substring(5, 7);
            if (transactionMonth !== currentFilters.month) {
                return false;
            }
        }

        // 種別でフィルター
        if (currentFilters.type && transaction.transactionType !== currentFilters.type) {
            return false;
        }

        // キーワード検索
        if (currentFilters.keyword) {
            const keyword = currentFilters.keyword.toLowerCase();
            const purpose = transaction.purpose.toLowerCase();
            const notes = (transaction.notes || '').toLowerCase();
            if (!purpose.includes(keyword) && !notes.includes(keyword)) {
                return false;
            }
        }

        return true;
    });

    // フィルターサマリー表示
    if (currentFilters.year || currentFilters.month || currentFilters.type || currentFilters.keyword) {
        const totalAmount = filteredTransactions.reduce((sum, t) => {
            return sum + (t.transactionType === '出金' ? -t.amount : t.amount);
        }, 0);
        const outgoing = filteredTransactions.filter(t => t.transactionType === '出金').reduce((sum, t) => sum + t.amount, 0);
        const incoming = filteredTransactions.filter(t => t.transactionType === '入金').reduce((sum, t) => sum + t.amount, 0);

        filterSummary.innerHTML = `
            表示中: ${filteredTransactions.length}件 |
            出金: ${outgoing.toLocaleString()}円 |
            入金: ${incoming.toLocaleString()}円 |
            差額: ${totalAmount.toLocaleString()}円
        `;
        filterSummary.classList.remove('hidden');
    } else {
        filterSummary.classList.add('hidden');
    }

    if (filteredTransactions.length === 0) {
        listContainer.innerHTML = '<p class="empty-message">条件に一致する記録がありません</p>';
        return;
    }

    listContainer.innerHTML = filteredTransactions.map(transaction => `
        <div class="transaction-item" onclick="showTransactionDetail(${transaction.id})" style="cursor: pointer;">
            ${transaction.imageUrl ? `
                <img src="${transaction.imageUrl}" alt="領収書" class="transaction-image" onclick="event.stopPropagation(); showImageModal('${transaction.imageUrl}')">
            ` : '<div class="no-image">画像なし</div>'}
            <div class="transaction-details">
                <strong>${transaction.amount.toLocaleString()}円</strong>
                <p class="purpose-text">${transaction.purpose}</p>
                <p class="date-text">日付: ${transaction.date}</p>
                <div class="transaction-meta">
                    <span class="badge badge-payment">${transaction.paymentMethod}</span>
                    ${transaction.paymentDetail ? `<span class="badge badge-detail">${transaction.paymentDetail}</span>` : ''}
                    <span class="badge badge-type-${transaction.transactionType === '出金' ? 'outgoing' : 'incoming'}">
                        ${transaction.transactionType}
                    </span>
                </div>
                ${transaction.notes ? `<p class="notes-preview">メモ: ${transaction.notes.length > 30 ? transaction.notes.substring(0, 30) + '...' : transaction.notes}</p>` : ''}
            </div>
            ${isAdmin ? `
                <div class="transaction-actions" onclick="event.stopPropagation()">
                    <div class="action-menu">
                        <button class="btn-menu" onclick="toggleActionMenu(this)">⋮</button>
                        <div class="action-dropdown">
                            <button class="btn btn-secondary" onclick="editTransaction(${transaction.id})">編集</button>
                            <button class="btn btn-danger" onclick="deleteTransaction(${transaction.id})">削除</button>
                        </div>
                    </div>
                </div>
            ` : ''}
        </div>
    `).join('');
}

// アクションメニューの表示/非表示を切り替え
function toggleActionMenu(button) {
    const dropdown = button.nextElementSibling;
    const isOpen = dropdown.classList.contains('show');

    // 他のメニューを閉じる
    document.querySelectorAll('.action-dropdown.show').forEach(d => {
        d.classList.remove('show');
    });

    // このメニューを切り替え
    if (!isOpen) {
        dropdown.classList.add('show');
    }
}

// ページのどこかをクリックしたらメニューを閉じる
document.addEventListener('click', (e) => {
    if (!e.target.closest('.action-menu')) {
        document.querySelectorAll('.action-dropdown.show').forEach(d => {
            d.classList.remove('show');
        });
    }
});

// 画像モーダル表示（簡易版）
function showImageModal(imageUrl) {
    const modal = window.open('', '_blank', 'width=800,height=600');
    modal.document.write(`
        <html>
            <head>
                <title>領収書</title>
                <style>
                    body { margin: 0; display: flex; justify-content: center; align-items: center; background: #000; }
                    img { max-width: 100%; max-height: 100vh; }
                </style>
            </head>
            <body>
                <img src="${imageUrl}" alt="領収書">
            </body>
        </html>
    `);
}

// 取引詳細モーダル表示
function showTransactionDetail(id) {
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) return;

    // 既存のモーダルがあれば削除
    const existingModal = document.getElementById('detailModal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'detailModal';
    modal.className = 'detail-modal';
    modal.innerHTML = `
        <div class="detail-modal-overlay" onclick="closeDetailModal()"></div>
        <div class="detail-modal-content">
            <button class="detail-modal-close" onclick="closeDetailModal()">×</button>
            <h2>取引詳細</h2>

            ${transaction.imageUrl ? `
                <div class="detail-image-container">
                    <img src="${transaction.imageUrl}" alt="領収書" class="detail-image" onclick="showImageModal('${transaction.imageUrl}')">
                    <p class="detail-image-hint">クリックで拡大</p>
                </div>
            ` : ''}

            <div class="detail-info">
                <div class="detail-row">
                    <span class="detail-label">金額</span>
                    <span class="detail-value detail-amount ${transaction.transactionType === '出金' ? 'outgoing' : 'incoming'}">
                        ${transaction.transactionType === '出金' ? '-' : '+'}${transaction.amount.toLocaleString()}円
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">用途</span>
                    <span class="detail-value">${transaction.purpose}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">日付</span>
                    <span class="detail-value">${transaction.date}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">支払い方法</span>
                    <span class="detail-value">${transaction.paymentMethod}</span>
                </div>
                ${transaction.paymentDetail ? `
                    <div class="detail-row">
                        <span class="detail-label">口座・カード</span>
                        <span class="detail-value">${transaction.paymentDetail}</span>
                    </div>
                ` : ''}
                <div class="detail-row">
                    <span class="detail-label">種別</span>
                    <span class="detail-value">${transaction.transactionType}</span>
                </div>
                ${transaction.notes ? `
                    <div class="detail-row">
                        <span class="detail-label">メモ</span>
                        <span class="detail-value detail-notes">${transaction.notes}</span>
                    </div>
                ` : ''}
                <div class="detail-row detail-meta">
                    <span class="detail-label">登録日時</span>
                    <span class="detail-value">${new Date(transaction.createdAt).toLocaleString('ja-JP')}</span>
                </div>
                ${transaction.updatedAt ? `
                    <div class="detail-row detail-meta">
                        <span class="detail-label">更新日時</span>
                        <span class="detail-value">${new Date(transaction.updatedAt).toLocaleString('ja-JP')}</span>
                    </div>
                ` : ''}
            </div>

            ${isAdmin ? `
                <div class="detail-actions">
                    <button class="btn btn-secondary" onclick="closeDetailModal(); editTransaction(${transaction.id});">編集</button>
                    <button class="btn btn-danger" onclick="closeDetailModal(); deleteTransaction(${transaction.id});">削除</button>
                </div>
            ` : ''}
        </div>
    `;

    document.body.appendChild(modal);

    // ESCキーで閉じる
    document.addEventListener('keydown', handleModalEscape);
}

// モーダルをESCで閉じるハンドラー
function handleModalEscape(e) {
    if (e.key === 'Escape') {
        closeDetailModal();
    }
}

// 詳細モーダルを閉じる
function closeDetailModal() {
    const modal = document.getElementById('detailModal');
    if (modal) {
        modal.remove();
    }
    document.removeEventListener('keydown', handleModalEscape);
}

// 編集中の取引ID
let editingTransactionId = null;

// 取引を編集
function editTransaction(id) {
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) return;

    // フォームに値を設定
    document.getElementById('date').value = transaction.date;
    document.getElementById('amount').value = transaction.amount;
    document.getElementById('purpose').value = transaction.purpose;
    document.getElementById('paymentMethod').value = transaction.paymentMethod;
    document.getElementById('transactionType').value = transaction.transactionType;
    document.getElementById('notes').value = transaction.notes || '';

    // 支払い詳細を設定
    const paymentDetailSelect = document.getElementById('paymentDetail');
    if (transaction.paymentDetail) {
        // 選択肢にあるか確認
        const optionExists = Array.from(paymentDetailSelect.options).some(opt => opt.value === transaction.paymentDetail);
        if (optionExists) {
            paymentDetailSelect.value = transaction.paymentDetail;
        } else {
            paymentDetailSelect.value = '__new__';
            document.getElementById('paymentDetailNew').value = transaction.paymentDetail;
            document.getElementById('paymentDetailNew').classList.remove('hidden');
        }
    }

    // 画像を設定
    if (transaction.imageUrl) {
        currentImageUrl = transaction.imageUrl;
        showImagePreview(transaction.imageUrl);
    }

    // 編集モードを設定
    editingTransactionId = id;

    // フォームを表示してスクロール
    document.getElementById('formSection').classList.remove('hidden');
    document.getElementById('formSection').scrollIntoView({ behavior: 'smooth' });

    // フォームのタイトルを変更
    document.querySelector('#formSection h2').textContent = '取引情報を編集';
}

// 取引削除
async function deleteTransaction(id) {
    if (confirm('この取引を削除しますか？')) {
        // Firestoreから削除
        await deleteTransactionFromFirestore(id);

        // ローカルからも削除（即時反映用）
        transactions = transactions.filter(t => t.id !== id);
        saveTransactions();
        updateYearOptions();
        updateMonthOptions();
        updateTypeOptions();
        renderTransactionList();
    }
}

// Firestoreに保存（1件追加）
async function saveTransactionToFirestore(transaction) {
    try {
        // 画像データが大きすぎる場合は保存しない（Firestoreの1MB制限）
        const transactionData = { ...transaction };
        if (transactionData.imageUrl && transactionData.imageUrl.length > 900000) {
            console.warn('画像が大きすぎるため、画像なしで保存します');
            transactionData.imageUrl = null;
        }

        await db.collection('transactions').doc(String(transaction.id)).set(transactionData);
        console.log('Firestoreに保存しました:', transaction.id);
    } catch (error) {
        console.error('Firestore保存エラー:', error);
        // フォールバック: ローカルストレージにも保存
        localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    }
}

// Firestoreから削除
async function deleteTransactionFromFirestore(id) {
    try {
        await db.collection('transactions').doc(String(id)).delete();
        console.log('Firestoreから削除しました:', id);
    } catch (error) {
        console.error('Firestore削除エラー:', error);
    }
}

// ローカルストレージに保存（バックアップ用）
function saveTransactions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

// Firestoreからリアルタイムで読み込み
function loadTransactions() {
    // まずローカルストレージから読み込み（オフライン時の表示用）
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        transactions = JSON.parse(saved);
        renderTransactionList();
    }

    // Firestoreからリアルタイムで同期
    if (unsubscribeFirestore) {
        unsubscribeFirestore();
    }

    unsubscribeFirestore = db.collection('transactions')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            transactions = [];
            snapshot.forEach((doc) => {
                transactions.push(doc.data());
            });

            // ローカルにもバックアップ（Firestoreのデータで上書き）
            localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));

            updateYearOptions();
            updateMonthOptions();
            updateTypeOptions();
            renderTransactionList();
            console.log('Firestoreから同期しました:', transactions.length, '件');
        }, (error) => {
            console.error('Firestore同期エラー:', error);
            // エラー時はローカルストレージから読み込み
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                transactions = JSON.parse(saved);
            }
        });
}

// ローカルデータをFirestoreにアップロード
async function uploadLocalDataToFirestore(data) {
    for (const transaction of data) {
        try {
            await saveTransactionToFirestore(transaction);
        } catch (error) {
            console.error('アップロードエラー:', error);
        }
    }
    console.log('ローカルデータのアップロード完了:', data.length, '件');
}

// カスタム支払い詳細の選択肢を読み込み
function loadPaymentDetailOptions() {
    const saved = localStorage.getItem(PAYMENT_DETAILS_KEY);
    if (saved) {
        const parsed = JSON.parse(saved);
        // 旧形式（文字列配列）からの移行対応
        if (parsed.length > 0 && typeof parsed[0] === 'string') {
            paymentDetailOptions = parsed.map(name => ({ name, count: 1 }));
            savePaymentDetailOptions();
        } else {
            paymentDetailOptions = parsed;
        }
    }
    updatePaymentDetailSelect();
    setupPaymentDetailListeners();
}

// カスタム支払い詳細の選択肢を保存
function savePaymentDetailOptions() {
    localStorage.setItem(PAYMENT_DETAILS_KEY, JSON.stringify(paymentDetailOptions));
}

// selectを更新（使用回数順）
function updatePaymentDetailSelect() {
    const select = document.getElementById('paymentDetail');
    // 固定オプション以外をクリア
    select.innerHTML = '<option value="">選択してください</option><option value="__new__">＋ 新規追加...</option>';

    // 使用回数でソート（多い順）
    const sorted = [...paymentDetailOptions].sort((a, b) => b.count - a.count);

    sorted.forEach(option => {
        const optionEl = document.createElement('option');
        optionEl.value = option.name;
        optionEl.textContent = `${option.name}（${option.count}回）`;
        select.appendChild(optionEl);
    });
}

// 支払い詳細セレクトのイベントリスナー
function setupPaymentDetailListeners() {
    const select = document.getElementById('paymentDetail');
    const newInput = document.getElementById('paymentDetailNew');

    select.addEventListener('change', () => {
        if (select.value === '__new__') {
            newInput.classList.remove('hidden');
            newInput.focus();
        } else {
            newInput.classList.add('hidden');
            newInput.value = '';
        }
    });
}

// 用途に基づいてメモ候補を表示
function setupMemoSuggestion() {
    const purposeInput = document.getElementById('purpose');
    const memoSuggestion = document.getElementById('memoSuggestion');
    const usePreviousMemoBtn = document.getElementById('usePreviousMemo');
    const notesTextarea = document.getElementById('notes');

    // 用途が変更されたらメモ候補を検索
    purposeInput.addEventListener('change', () => {
        showMemoSuggestion(purposeInput.value);
    });

    purposeInput.addEventListener('blur', () => {
        showMemoSuggestion(purposeInput.value);
    });

    // 候補をクリックしたらメモに反映
    usePreviousMemoBtn.addEventListener('click', () => {
        notesTextarea.value = usePreviousMemoBtn.textContent;
        memoSuggestion.classList.add('hidden');
    });
}

// メモ候補を表示
function showMemoSuggestion(purpose) {
    const memoSuggestion = document.getElementById('memoSuggestion');
    const usePreviousMemoBtn = document.getElementById('usePreviousMemo');
    const notesTextarea = document.getElementById('notes');

    if (!purpose || notesTextarea.value) {
        memoSuggestion.classList.add('hidden');
        return;
    }

    // 同じ用途の過去の取引でメモがあるものを検索
    const previousMemo = transactions.find(t =>
        t.purpose === purpose && t.notes && t.notes.trim()
    );

    if (previousMemo) {
        usePreviousMemoBtn.textContent = previousMemo.notes;
        memoSuggestion.classList.remove('hidden');
    } else {
        memoSuggestion.classList.add('hidden');
    }
}

// 支払い詳細の値を取得
function getPaymentDetailValue() {
    const select = document.getElementById('paymentDetail');
    const newInput = document.getElementById('paymentDetailNew');

    if (select.value === '__new__') {
        return newInput.value.trim();
    }
    return select.value;
}

// 新しい支払い詳細を追加または使用回数を更新
function addPaymentDetailOption(detail) {
    if (!detail) return;

    const existing = paymentDetailOptions.find(opt => opt.name === detail);
    if (existing) {
        existing.count++;
    } else {
        paymentDetailOptions.push({ name: detail, count: 1 });
    }

    savePaymentDetailOptions();
    updatePaymentDetailSelect();
}

// Excelエクスポート
function exportToExcel() {
    if (transactions.length === 0) {
        alert('エクスポートするデータがありません');
        return;
    }

    // データを整形
    const data = transactions.map(t => ({
        '日付': t.date,
        '金額': t.amount,
        '用途': t.purpose,
        '支払い方法': t.paymentMethod,
        'カード詳細': t.paymentDetail || '',
        '種別': t.transactionType,
        'メモ': t.notes || '',
        '登録日時': new Date(t.createdAt).toLocaleString('ja-JP')
    }));

    // ワークブック作成
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '経理データ');

    // ファイル名生成
    const today = new Date().toISOString().split('T')[0];
    const filename = `経理データ_${today}.xlsx`;

    // ダウンロード
    XLSX.writeFile(wb, filename);

    alert(`${filename} をダウンロードしました`);
}

// 年の選択肢を更新
function updateYearOptions() {
    const filterYear = document.getElementById('filterYear');
    const years = new Set();

    transactions.forEach(t => {
        const year = t.date.substring(0, 4);
        years.add(year);
    });

    const sortedYears = Array.from(years).sort().reverse();

    // 既存のオプション（「全て」以外）をクリア
    filterYear.innerHTML = '<option value="">全て</option>';

    sortedYears.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `${year}年`;
        filterYear.appendChild(option);
    });
}

// 月の選択肢を更新（データがある月のみ表示）
function updateMonthOptions() {
    const filterMonth = document.getElementById('filterMonth');
    const filterYear = document.getElementById('filterYear');
    const selectedYear = filterYear.value;
    const months = new Set();

    transactions.forEach(t => {
        // 年が選択されている場合はその年のデータのみ
        if (selectedYear && !t.date.startsWith(selectedYear)) {
            return;
        }
        const month = t.date.substring(5, 7);
        months.add(month);
    });

    const sortedMonths = Array.from(months).sort();

    // 既存のオプション（「全て」以外）をクリア
    filterMonth.innerHTML = '<option value="">全て</option>';

    sortedMonths.forEach(month => {
        const option = document.createElement('option');
        option.value = month;
        option.textContent = `${parseInt(month)}月`;
        filterMonth.appendChild(option);
    });
}

// 種別の選択肢を更新（データがある種別のみ表示）
function updateTypeOptions() {
    const filterType = document.getElementById('filterType');
    const types = new Set();

    transactions.forEach(t => {
        types.add(t.transactionType);
    });

    // 既存のオプション（「全て」以外）をクリア
    filterType.innerHTML = '<option value="">全て</option>';

    // 出金→入金の順で表示（データがあるもののみ）
    if (types.has('出金')) {
        const option = document.createElement('option');
        option.value = '出金';
        option.textContent = '出金';
        filterType.appendChild(option);
    }
    if (types.has('入金')) {
        const option = document.createElement('option');
        option.value = '入金';
        option.textContent = '入金';
        filterType.appendChild(option);
    }
}

// データバックアップ（JSON形式）
function backupData() {
    if (transactions.length === 0) {
        alert('バックアップするデータがありません');
        return;
    }

    const dataStr = JSON.stringify(transactions, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().split('T')[0];

    a.href = url;
    a.download = `経理データバックアップ_${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert('バックアップファイルをダウンロードしました。\nこのファイルは大切に保管してください。');
}

// データ復元
function restoreData(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm('現在のデータに復元したデータを追加します。\n（既存データは削除されません）\n\n続けますか？')) {
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const restoredData = JSON.parse(e.target.result);

            if (!Array.isArray(restoredData)) {
                throw new Error('無効なバックアップファイル形式です');
            }

            // IDの重複を避けるため、新しいIDを割り当てる
            const now = Date.now();
            restoredData.forEach((item, index) => {
                item.id = now + index;
            });

            // 既存データに追加
            transactions = [...transactions, ...restoredData];

            // 日付順にソート（新しい順）
            transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

            saveTransactions();
            updateYearOptions();
            updateMonthOptions();
            updateTypeOptions();
            renderTransactionList();

            alert(`${restoredData.length}件のデータを復元しました`);
        } catch (error) {
            console.error('Error:', error);
            alert('データの復元に失敗しました。\nファイル形式が正しいか確認してください。\nエラー: ' + error.message);
        }

        event.target.value = '';
    };

    reader.readAsText(file);
}

// ========== Gemini API設定関連 ==========

// APIキーを読み込み
function loadGeminiApiKey() {
    const saved = localStorage.getItem(GEMINI_API_KEY);
    if (saved) {
        geminiApiKey = saved;
        document.getElementById('geminiApiKey').value = saved;
        updateApiStatus(true);
        // APIキーが設定済みなら設定を畳む
        document.getElementById('apiSettingsContent').classList.add('collapsed');
        document.getElementById('toggleApiSettings').textContent = '設定を表示';
    }
}

// APIキーを保存
async function saveGeminiApiKey() {
    const input = document.getElementById('geminiApiKey');
    const key = input.value.trim();

    if (!key) {
        alert('APIキーを入力してください');
        return;
    }

    if (!key.startsWith('AIza')) {
        alert('無効なAPIキーです。AIza で始まるキーを入力してください。');
        return;
    }

    geminiApiKey = key;
    localStorage.setItem(GEMINI_API_KEY, key);

    // ログイン中ならFirestoreにも保存（他デバイスと同期）
    if (currentUser) {
        await saveUserApiKey(key);
    }

    updateApiStatus(true);
    alert('APIキーを保存しました。Gemini APIで高精度な読み取りが可能になりました！');
}

// APIキーを削除
function clearGeminiApiKey() {
    if (confirm('APIキーを削除しますか？\n削除後はTesseract.js（精度低め）で読み取ります。')) {
        geminiApiKey = null;
        localStorage.removeItem(GEMINI_API_KEY);
        document.getElementById('geminiApiKey').value = '';
        updateApiStatus(false);
    }
}

// APIステータス表示を更新
function updateApiStatus(isSet) {
    const status = document.getElementById('apiStatus');
    if (isSet) {
        status.textContent = 'Gemini API: 有効（高精度モード）';
        status.className = 'api-status success';
    } else {
        status.textContent = 'Gemini API: 未設定（Tesseract.jsで読み取り）';
        status.className = 'api-status';
        status.style.display = 'block';
        status.style.background = '#fff3cd';
        status.style.color = '#856404';
    }
}

// API設定のイベントリスナー
function setupApiSettingsListeners() {
    const saveBtn = document.getElementById('saveApiKey');
    const clearBtn = document.getElementById('clearApiKey');
    const toggleBtn = document.getElementById('toggleApiSettings');
    const content = document.getElementById('apiSettingsContent');

    saveBtn.addEventListener('click', saveGeminiApiKey);
    clearBtn.addEventListener('click', clearGeminiApiKey);

    toggleBtn.addEventListener('click', () => {
        content.classList.toggle('collapsed');
        toggleBtn.textContent = content.classList.contains('collapsed') ? '設定を表示' : '設定を隠す';
    });

    // 初期状態でAPIキーがなければステータス表示
    if (!geminiApiKey) {
        updateApiStatus(false);
    }
}

// ========== 認証関連 ==========

// 認証状態を監視
function setupAuth() {
    const loginBtn = document.getElementById('googleLoginBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    loginBtn.addEventListener('click', googleLogin);
    logoutBtn.addEventListener('click', logout);

    // 認証状態の変化を監視
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await checkUserStatus(user);
        } else {
            currentUser = null;
            isAdmin = false;
            isApproved = false;
            showLoginPrompt();
        }
    });
}

// Googleログイン
async function googleLogin() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        // まずポップアップを試す、ダメならリダイレクト
        try {
            await auth.signInWithPopup(provider);
        } catch (popupError) {
            // ポップアップが使えない環境（アプリ内ブラウザなど）はリダイレクト
            if (popupError.code === 'auth/operation-not-supported-in-this-environment' ||
                popupError.code === 'auth/popup-blocked') {
                console.log('ポップアップが使えないため、リダイレクト方式に切り替え');
                await auth.signInWithRedirect(provider);
            } else {
                throw popupError;
            }
        }
    } catch (error) {
        console.error('ログインエラー:', error);
        const errorMessage = getJapaneseErrorMessage(error.code);
        alert('ログインに失敗しました:\n' + errorMessage);
    }
}

// Firebaseエラーを日本語に変換
function getJapaneseErrorMessage(errorCode) {
    const errorMessages = {
        'auth/unauthorized-domain': 'このドメインは許可されていません。\n管理者にFirebase設定を確認してもらってください。',
        'auth/popup-closed-by-user': 'ログイン画面が閉じられました。\nもう一度お試しください。',
        'auth/popup-blocked': 'ポップアップがブロックされました。\nリダイレクト方式で再試行します。',
        'auth/cancelled-popup-request': 'ログインがキャンセルされました。',
        'auth/network-request-failed': 'ネットワークエラーです。\nインターネット接続を確認してください。',
        'auth/user-disabled': 'このアカウントは無効化されています。',
        'auth/operation-not-allowed': 'Googleログインが有効になっていません。',
        'auth/operation-not-supported-in-this-environment': 'このブラウザではポップアップログインが使えません。\nリダイレクト方式で再試行します。',
        'auth/internal-error': '内部エラーが発生しました。しばらく待ってからお試しください。'
    };
    return errorMessages[errorCode] || `エラーが発生しました (${errorCode})`;
}

// ログアウト
async function logout() {
    try {
        await auth.signOut();
    } catch (error) {
        console.error('ログアウトエラー:', error);
    }
}

// ユーザーの承認状態をチェック
async function checkUserStatus(user) {
    try {
        // ユーザードキュメントを取得
        const userDoc = await db.collection('users').doc(user.uid).get();

        if (!userDoc.exists) {
            // 最初のユーザーかチェック
            const usersSnapshot = await db.collection('users').get();

            if (usersSnapshot.empty) {
                // 最初のユーザー = 管理者
                await db.collection('users').doc(user.uid).set({
                    email: user.email,
                    name: user.displayName,
                    photo: user.photoURL,
                    isAdmin: true,
                    isApproved: true,
                    createdAt: new Date().toISOString()
                });
                isAdmin = true;
                isApproved = true;
            } else {
                // 新規ユーザー = 承認待ち
                await db.collection('users').doc(user.uid).set({
                    email: user.email,
                    name: user.displayName,
                    photo: user.photoURL,
                    isAdmin: false,
                    isApproved: false,
                    createdAt: new Date().toISOString()
                });
                isAdmin = false;
                isApproved = false;
            }
        } else {
            const userData = userDoc.data();
            isAdmin = userData.isAdmin || false;
            isApproved = userData.isApproved || false;
        }

        updateAuthUI(user);

    } catch (error) {
        console.error('ユーザー状態チェックエラー:', error);
    }
}

// 認証UIを更新
function updateAuthUI(user) {
    const loginPrompt = document.getElementById('loginPrompt');
    const userInfo = document.getElementById('userInfo');
    const userPhoto = document.getElementById('userPhoto');
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    const mainContent = document.querySelector('main');
    const pendingApproval = document.getElementById('pendingApproval');
    const adminPanel = document.getElementById('adminPanel');

    loginPrompt.classList.add('hidden');
    userInfo.classList.remove('hidden');

    userPhoto.src = user.photoURL || '';
    userName.textContent = user.displayName || user.email;

    // 役割バッジを表示
    if (isAdmin) {
        userRole.textContent = '管理者';
        userRole.className = 'user-role role-admin';
    } else if (isApproved) {
        userRole.textContent = '経理';
        userRole.className = 'user-role role-staff';
    } else {
        userRole.textContent = '承認待ち';
        userRole.className = 'user-role role-pending';
    }

    if (isApproved) {
        // 承認済み - メインコンテンツを表示
        mainContent.classList.remove('hidden');
        pendingApproval.classList.add('hidden');

        // 管理者の場合は承認パネルを表示
        if (isAdmin) {
            adminPanel.classList.remove('hidden');
            loadPendingUsers();
            // 管理者は全機能使用可能
            document.querySelector('.upload-section').classList.remove('hidden');
            document.getElementById('apiSettingsSection').classList.remove('hidden');
            document.getElementById('backupBtn').classList.remove('hidden');
            document.getElementById('restoreBtn').classList.remove('hidden');
        } else {
            adminPanel.classList.add('hidden');
            // 経理は閲覧・エクスポートのみ（追加・API設定・バックアップは非表示）
            document.querySelector('.upload-section').classList.add('hidden');
            document.getElementById('apiSettingsSection').classList.add('hidden');
            document.getElementById('backupBtn').classList.add('hidden');
            document.getElementById('restoreBtn').classList.add('hidden');
        }

        // APIキーをFirestoreから読み込み
        loadUserApiKey(user.uid);

        // 権限に応じて一覧を再描画（編集・削除ボタンの表示/非表示）
        renderTransactionList();
    } else {
        // 承認待ち
        mainContent.classList.add('hidden');
        pendingApproval.classList.remove('hidden');
        adminPanel.classList.add('hidden');

        // 承認状態をリアルタイムで監視
        watchApprovalStatus(user.uid);
    }
}

// ログイン画面を表示
function showLoginPrompt() {
    const loginPrompt = document.getElementById('loginPrompt');
    const userInfo = document.getElementById('userInfo');
    const mainContent = document.querySelector('main');
    const pendingApproval = document.getElementById('pendingApproval');
    const adminPanel = document.getElementById('adminPanel');

    loginPrompt.classList.remove('hidden');
    userInfo.classList.add('hidden');
    mainContent.classList.add('hidden');
    pendingApproval.classList.add('hidden');
    adminPanel.classList.add('hidden');
}

// 承認待ちユーザー一覧を読み込み
function loadPendingUsers() {
    const pendingUsersList = document.getElementById('pendingUsersList');

    // データ管理ボタンのイベントリスナー
    const cleanupBtn = document.getElementById('cleanupDuplicatesBtn');
    const deleteAllBtn = document.getElementById('deleteAllDataBtn');

    if (cleanupBtn) {
        cleanupBtn.onclick = cleanupDuplicates;
    }
    if (deleteAllBtn) {
        deleteAllBtn.onclick = deleteAllData;
    }

    db.collection('users')
        .where('isApproved', '==', false)
        .onSnapshot((snapshot) => {
            if (snapshot.empty) {
                pendingUsersList.innerHTML = '<p class="no-pending">承認待ちのユーザーはいません</p>';
                return;
            }

            pendingUsersList.innerHTML = '';
            snapshot.forEach((doc) => {
                const userData = doc.data();
                const userItem = document.createElement('div');
                userItem.className = 'pending-user-item';
                userItem.innerHTML = `
                    <img src="${userData.photo || ''}" alt="${userData.name}" class="pending-user-photo">
                    <div class="pending-user-info">
                        <span class="pending-user-name">${userData.name}</span>
                        <span class="pending-user-email">${userData.email}</span>
                    </div>
                    <button class="btn btn-primary btn-approve" data-uid="${doc.id}">許可</button>
                `;
                pendingUsersList.appendChild(userItem);
            });

            // 許可ボタンのイベント
            pendingUsersList.querySelectorAll('.btn-approve').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const uid = btn.dataset.uid;
                    await approveUser(uid);
                });
            });
        });
}

// ユーザーを承認
async function approveUser(uid) {
    try {
        await db.collection('users').doc(uid).update({
            isApproved: true
        });
        alert('ユーザーを承認しました');
    } catch (error) {
        console.error('承認エラー:', error);
        alert('承認に失敗しました: ' + error.message);
    }
}

// 重複データを削除（同じ日付・金額・用途のデータを1つだけ残す）
async function cleanupDuplicates() {
    if (!confirm('重複データを検出して削除します。\n同じ「日付・金額・用途」のデータは1つだけ残します。\n\n続けますか？')) {
        return;
    }

    try {
        const snapshot = await db.collection('transactions').get();
        const allDocs = [];
        snapshot.forEach(doc => {
            allDocs.push({ id: doc.id, data: doc.data() });
        });

        console.log('全データ数:', allDocs.length);

        // 重複を検出（日付・金額・用途でグループ化）
        const seen = new Map();
        const duplicateIds = [];

        allDocs.forEach(doc => {
            const key = `${doc.data.date}_${doc.data.amount}_${doc.data.purpose}`;
            if (seen.has(key)) {
                // 重複 - 削除対象に追加
                duplicateIds.push(doc.id);
            } else {
                seen.set(key, doc.id);
            }
        });

        console.log('重複データ数:', duplicateIds.length);

        if (duplicateIds.length === 0) {
            alert('重複データはありませんでした。');
            return;
        }

        if (!confirm(`${duplicateIds.length}件の重複データを削除します。\n本当に続けますか？`)) {
            return;
        }

        // 削除実行
        let deleted = 0;
        for (const id of duplicateIds) {
            await db.collection('transactions').doc(id).delete();
            deleted++;
            if (deleted % 10 === 0) {
                console.log(`${deleted}/${duplicateIds.length} 削除完了`);
            }
        }

        alert(`${deleted}件の重複データを削除しました。`);

    } catch (error) {
        console.error('重複削除エラー:', error);
        alert('エラーが発生しました: ' + error.message);
    }
}

// 全データを削除
async function deleteAllData() {
    if (!confirm('⚠️ 警告 ⚠️\n\n全てのデータを削除します。\nこの操作は取り消せません。\n\n本当に続けますか？')) {
        return;
    }

    if (!confirm('本当に全データを削除しますか？\n\n「OK」を押すと全てのデータが削除されます。')) {
        return;
    }

    try {
        const snapshot = await db.collection('transactions').get();
        const total = snapshot.size;

        if (total === 0) {
            alert('削除するデータがありません。');
            return;
        }

        let deleted = 0;
        for (const doc of snapshot.docs) {
            await doc.ref.delete();
            deleted++;
            if (deleted % 10 === 0) {
                console.log(`${deleted}/${total} 削除完了`);
            }
        }

        // ローカルストレージもクリア
        localStorage.removeItem(STORAGE_KEY);

        alert(`${deleted}件のデータを削除しました。`);

    } catch (error) {
        console.error('全削除エラー:', error);
        alert('エラーが発生しました: ' + error.message);
    }
}

// 承認状態をリアルタイムで監視
function watchApprovalStatus(uid) {
    db.collection('users').doc(uid).onSnapshot((doc) => {
        if (doc.exists) {
            const userData = doc.data();
            if (userData.isApproved) {
                isApproved = true;
                updateAuthUI(currentUser);
            }
        }
    });
}

// ユーザーのAPIキーをFirestoreから読み込み
async function loadUserApiKey(uid) {
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.geminiApiKey) {
                geminiApiKey = userData.geminiApiKey;
                document.getElementById('geminiApiKey').value = geminiApiKey;
                updateApiStatus(true);
                document.getElementById('apiSettingsContent').classList.add('collapsed');
                document.getElementById('toggleApiSettings').textContent = '設定を表示';
            }
        }
    } catch (error) {
        console.error('APIキー読み込みエラー:', error);
    }
}

// ユーザーのAPIキーをFirestoreに保存
async function saveUserApiKey(apiKey) {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).update({
            geminiApiKey: apiKey
        });
        console.log('APIキーをFirestoreに保存しました');
    } catch (error) {
        console.error('APIキー保存エラー:', error);
    }
}
