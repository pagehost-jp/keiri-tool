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

// ローカルストレージのキー
const STORAGE_KEY = 'keiri_transactions';
const PAYMENT_DETAILS_KEY = 'keiri_payment_details';

// カスタム支払い詳細の選択肢
let paymentDetailOptions = [];

// DOMロード時の初期化
document.addEventListener('DOMContentLoaded', () => {
    loadTransactions();
    loadPaymentDetailOptions();
    updateYearOptions();
    updateMonthOptions();
    updateTypeOptions();
    renderTransactionList();
    setupEventListeners();
    setupFormValidation();
    setupFilterListeners();
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
        currentImageUrl = e.target.result;
        showImagePreview(currentImageUrl);

        // Base64データを取得（data:image/...;base64, の部分を除く）
        currentImageData = e.target.result.split(',')[1];

        // Claude APIで画像解析
        await analyzeReceipt(currentImageData);
    };
    reader.readAsDataURL(file);
}

// 画像プレビュー表示
function showImagePreview(imageUrl) {
    const previewArea = document.getElementById('previewArea');
    previewArea.innerHTML = `<img src="${imageUrl}" alt="領収書プレビュー">`;
}

// Tesseract.js (OCR) で領収書を解析（完全無料・APIキー不要）
async function analyzeReceipt(imageData) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const formSection = document.getElementById('formSection');

    loadingIndicator.classList.remove('hidden');

    try {
        // Tesseract.js でOCR実行
        const { data: { text } } = await Tesseract.recognize(
            currentImageUrl,
            'jpn',  // 日本語認識
            {
                logger: info => {
                    console.log(info);
                }
            }
        );

        console.log('OCR結果:', text);

        // テキストから情報を抽出
        const extractedData = extractDataFromText(text);
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
function handleFormSubmit(event) {
    event.preventDefault();

    const paymentDetail = document.getElementById('paymentDetail').value.trim();

    const transaction = {
        id: Date.now(),
        date: document.getElementById('date').value,
        amount: parseInt(document.getElementById('amount').value),
        purpose: document.getElementById('purpose').value,
        paymentMethod: document.getElementById('paymentMethod').value,
        paymentDetail: paymentDetail,  // カード詳細を追加
        transactionType: document.getElementById('transactionType').value,
        notes: document.getElementById('notes').value,
        imageUrl: currentImageUrl,
        createdAt: new Date().toISOString()
    };

    // 新しい支払い詳細を選択肢に追加（次回から選べるように）
    if (paymentDetail) {
        addPaymentDetailOption(paymentDetail);
    }

    transactions.unshift(transaction); // 新しいものを先頭に
    saveTransactions();
    updateYearOptions();
    updateMonthOptions();
    updateTypeOptions();
    renderTransactionList();
    resetForm();

    alert('取引を保存しました！');
}

// フォームリセット
function resetForm() {
    document.getElementById('transactionForm').reset();
    document.getElementById('formSection').classList.add('hidden');
    document.getElementById('previewArea').innerHTML = '';
    currentImageData = null;
    currentImageUrl = null;

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
        <div class="transaction-item">
            ${transaction.imageUrl ? `
                <img src="${transaction.imageUrl}" alt="領収書" class="transaction-image" onclick="showImageModal('${transaction.imageUrl}')">
            ` : ''}
            <div class="transaction-details">
                <strong>${transaction.amount.toLocaleString()}円</strong>
                <p>${transaction.purpose}</p>
                <p>日付: ${transaction.date}</p>
                <div class="transaction-meta">
                    <span class="badge badge-payment">${transaction.paymentMethod}</span>
                    ${transaction.paymentDetail ? `<span class="badge badge-detail">${transaction.paymentDetail}</span>` : ''}
                    <span class="badge badge-type-${transaction.transactionType === '出金' ? 'outgoing' : 'incoming'}">
                        ${transaction.transactionType}
                    </span>
                </div>
                ${transaction.notes ? `<p style="font-size: 0.9em; color: #888;">メモ: ${transaction.notes}</p>` : ''}
            </div>
            <div class="transaction-actions">
                <button class="btn btn-danger" onclick="deleteTransaction(${transaction.id})">削除</button>
            </div>
        </div>
    `).join('');
}

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

// 取引削除
function deleteTransaction(id) {
    if (confirm('この取引を削除しますか？')) {
        transactions = transactions.filter(t => t.id !== id);
        saveTransactions();
        updateYearOptions();
        updateMonthOptions();
        updateTypeOptions();
        renderTransactionList();
    }
}

// ローカルストレージに保存
function saveTransactions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

// ローカルストレージから読み込み
function loadTransactions() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        transactions = JSON.parse(saved);
    }
}

// カスタム支払い詳細の選択肢を読み込み
function loadPaymentDetailOptions() {
    const saved = localStorage.getItem(PAYMENT_DETAILS_KEY);
    if (saved) {
        paymentDetailOptions = JSON.parse(saved);
    }
    updatePaymentDetailDatalist();
}

// カスタム支払い詳細の選択肢を保存
function savePaymentDetailOptions() {
    localStorage.setItem(PAYMENT_DETAILS_KEY, JSON.stringify(paymentDetailOptions));
}

// datalistを更新
function updatePaymentDetailDatalist() {
    const datalist = document.getElementById('paymentDetailList');
    datalist.innerHTML = '';
    paymentDetailOptions.forEach(option => {
        const optionEl = document.createElement('option');
        optionEl.value = option;
        datalist.appendChild(optionEl);
    });
}

// 新しい支払い詳細を追加（重複チェック付き）
function addPaymentDetailOption(detail) {
    if (detail && !paymentDetailOptions.includes(detail)) {
        paymentDetailOptions.push(detail);
        paymentDetailOptions.sort(); // アルファベット順にソート
        savePaymentDetailOptions();
        updatePaymentDetailDatalist();
    }
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
