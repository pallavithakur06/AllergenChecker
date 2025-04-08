let history = JSON.parse(localStorage.getItem("scannedHistory")) || [];

function startScanner() {
    Quagga.init({
        inputStream: { type: "LiveStream", target: document.querySelector("#scanner-container") },
        decoder: { readers: ["ean_reader"] }
    }, function (err) {
        if (err) {
            console.error(err);
            return;
        }
        Quagga.start();
    });

    Quagga.onDetected(function (data) {
        document.getElementById("barcodeInput").value = data.codeResult.code;
        checkAllergens();
        Quagga.stop();
    });
}

function checkAllergens() {
    let barcode = document.getElementById("barcodeInput").value.trim();
    if (!barcode) {
        alert("Please enter a barcode.");
        return;
    }

    let apiUrl = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`;

    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            if (data.status === 0) {
                document.getElementById("result").innerHTML = "<p>Product not found.</p>";
                return;
            }

            let product = data.product;
            let productName = product.product_name || "Unknown Product";
            let brand = product.brands || "Unknown Brand";
            let ingredients = product.ingredients_text || "No ingredient info available";
            let allergens = (product.allergens_tags && product.allergens_tags.length > 0)
                ? product.allergens_tags.map(a => a.replace(/^en:/, "")).join(", ")
                : "No allergen info available";

            let image = product.image_url || "";
            let country = (product.countries_tags && product.countries_tags.length > 0)
                ? product.countries_tags.map(c => c.replace(/^en:/, "")).join(", ")
                : "Unknown Country";

            let labels = product.labels ? product.labels.replace(/_/g, ", ") : "No labels available";
            let nutrition = product.nutriments || {};

            let energy = nutrition.energy_100g ? `${nutrition.energy_100g} kJ` : "N/A";
            let fat = nutrition.fat_100g ? `${nutrition.fat_100g} g` : "N/A";
            let carbs = nutrition.carbohydrates_100g ? `${nutrition.carbohydrates_100g} g` : "N/A";
            let protein = nutrition.proteins_100g ? `${nutrition.proteins_100g} g` : "N/A";
            let sugar = nutrition.sugars_100g ? `${nutrition.sugars_100g} g` : "N/A";
            let salt = nutrition.salt_100g ? `${nutrition.salt_100g} g` : "N/A";

            let userAllergens = localStorage.getItem("userAllergens")?.split(",") || [];
            let allergensList = allergens.split(", ");

            let highlightedAllergens = allergensList.map(allergen => {
                let normalizedAllergen = allergen.trim().toLowerCase();
                let userAllergensNormalized = userAllergens.map(a => a.trim().toLowerCase());

                if (userAllergensNormalized.includes(normalizedAllergen)) {
                    return `<span class="allergy-danger">${allergen}</span>`;
                } else {
                    return `<span class="allergy-safe">${allergen}</span>`;
                }
            }).join(", ");

            let resultHTML = `
                ${image ? `<img src="${image}" alt="${productName}" style="width:100%;">` : ""}
                <h3>${productName}</h3>
                <p><strong>Brand:</strong> ${brand}</p>
                <p><strong>Allergens:</strong> ${highlightedAllergens}</p>
                <p><strong>Ingredients:</strong> ${ingredients}</p>
                <p><strong>Country of Origin:</strong> ${country}</p>
                <p><strong>Labels:</strong> ${labels}</p>
                <h4>Nutrition per 100g:</h4>
                <p><strong>Energy:</strong> ${energy}</p>
                <p><strong>Fat:</strong> ${fat}</p>
                <p><strong>Carbohydrates:</strong> ${carbs}</p>
                <p><strong>Protein:</strong> ${protein}</p>
                <p><strong>Sugar:</strong> ${sugar}</p>
                <p><strong>Salt:</strong> ${salt}</p>
            `;

            document.getElementById("result").innerHTML = resultHTML;
            speak(allergens);
            addToHistory(productName, barcode);
        });
}

function speak(text) {
    let speech = new SpeechSynthesisUtterance(text);
    speech.lang = "en-US";
    speechSynthesis.speak(speech);
}

function addToHistory(name, barcode) {
    history.unshift({ name, barcode });
    if (history.length > 5) history.pop();
    localStorage.setItem("scannedHistory", JSON.stringify(history));
    displayHistory();
}

function displayHistory() {
    let historyList = document.getElementById("history-list");
    historyList.innerHTML = history.map(item => `<li>${item.name} (${item.barcode})</li>`).join("");
}

function clearHistory() {
    history = [];
    localStorage.removeItem("scannedHistory");
    displayHistory();
}

function savePersonalAllergens() {
    let allergens = document.getElementById("personalAllergens").value.trim();
    localStorage.setItem("userAllergens", allergens);
    alert("Allergens saved!");
}

function toggleDarkMode() {
    document.body.classList.toggle("dark-mode");
    document.querySelector(".container").classList.toggle("dark-mode");
}

function scanBarcodeFromImage() {
    let imageFile = document.getElementById("barcodeImageInput").files[0];
    if (!imageFile) {
        alert("Please upload an image.");
        return;
    }

    let reader = new FileReader();
    reader.onload = function (event) {
        let imageDataUrl = event.target.result;

        let img = new Image();
        img.src = imageDataUrl;
        img.onload = function () {
            Quagga.decodeSingle(
                {
                    src: imageDataUrl,
                    numOfWorkers: 0,
                    decoder: { readers: ["ean_reader"] },
                },
                function (result) {
                    if (result && result.codeResult) {
                        document.getElementById("barcodeInput").value = result.codeResult.code;
                        checkAllergens();
                    } else {
                        scanWithTesseract(imageFile);
                    }
                }
            );
        };
    };
    reader.readAsDataURL(imageFile);
}

function scanWithTesseract(imageFile) {
    Tesseract.recognize(imageFile, "eng").then(({ data }) => {
        let detectedText = data.text.trim();
        let barcode = extractBarcode(detectedText);

        if (barcode) {
            document.getElementById("barcodeInput").value = barcode;
            checkAllergens();
        } else {
            alert("Could not detect barcode. Please try a clearer image.");
        }
    });
}

function extractBarcode(text) {
    let matches = text.match(/\b\d{8,13}\b/);
    return matches ? matches[0] : null;
}

function startSpeechRecognition() {
    let recognition = new webkitSpeechRecognition();
    recognition.lang = "en-US";
    recognition.start();

    recognition.onresult = function (event) {
        let spokenText = event.results[0][0].transcript.replace(/\D/g, '');
        document.getElementById("barcodeInput").value = spokenText;
        checkAllergens();
    };
}

displayHistory();
