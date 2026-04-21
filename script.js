/* RTL Tester */
//document.documentElement.setAttribute("dir", "rtl");

/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");

/* Auto-detect RTL language from browser settings */
const rtlLanguages = ["ar", "he", "fa", "ur"];
const userLang = navigator.language.slice(0, 2);

if (rtlLanguages.includes(userLang)) {
  document.documentElement.setAttribute("dir", "rtl");
}

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card" data-id="${product.id}" data-product='${JSON.stringify(product).replace(/'/g, "&#39;")}'>
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p class="product-brand">${product.brand}</p>
        <p class="product-description">${product.description}</p>
      </div>
    </div>
  `,
    )
    .join("");

  /* Add click listeners to each product card */
  document.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => toggleProduct(card));
  });
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const selectedCategory = e.target.value;
  const searchTerm = document.getElementById("searchInput").value.toLowerCase();

  /* filter() creates a new array containing only products 
     where the category matches what the user selected */
  let filtered = products.filter((p) => p.category === selectedCategory);

  /* Apply search filter if there is a search term */
  if (searchTerm) {
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(searchTerm) ||
        p.brand.toLowerCase().includes(searchTerm) ||
        p.description.toLowerCase().includes(searchTerm),
    );
  }

  displayProducts(filtered);
});

/* Filter products by search input */
document.getElementById("searchInput").addEventListener("input", async (e) => {
  const products = await loadProducts();
  const searchTerm = e.target.value.toLowerCase();
  const selectedCategory = categoryFilter.value;

  let filtered = products;

  /* Apply category filter if one is selected */
  if (selectedCategory) {
    filtered = filtered.filter((p) => p.category === selectedCategory);
  }

  /* Apply search filter */
  filtered = filtered.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm) ||
      p.brand.toLowerCase().includes(searchTerm) ||
      p.description.toLowerCase().includes(searchTerm),
  );

  if (filtered.length === 0) {
    productsContainer.innerHTML = `<div class="placeholder-message">No products found.</div>`;
    return;
  }

  displayProducts(filtered);
});

/* Store conversation history */
let conversationHistory = [];

/* Chat form submission handler - connected to search Worker */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const userInput = document.getElementById("userInput");
  const message = userInput.value.trim();
  if (!message) return;

  addMessage("user", message);
  conversationHistory.push({ role: "user", content: message });
  userInput.value = "";

  const reply = await sendToSearchWorker(conversationHistory);
  conversationHistory.push({ role: "assistant", content: reply });
});

/* Send messages to Cloudflare Worker */
async function sendToWorker(messages) {
  const messagesWithSystem = [
    {
      role: "system",
      content:
        "You are a friendly L'Oréal beauty advisor. You must never use any markdown formatting in your responses — no asterisks, no bold, no bullet points with **, no headers with ##. Write everything as plain conversational text, like you are texting a friend. Keep responses short and warm.",
    },
    ...messages,
  ];

  /* Show loading indicator */
  const loadingDiv = addMessage("assistant", "...", true);

  const response = await fetch(
    "https://loreal-routine-worker.tiqbal1.workers.dev",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messagesWithSystem }),
    },
  );
  const data = await response.json();
  const reply = data.choices[0].message.content;

  /* Replace loading with real response */
  loadingDiv.classList.remove("loading");
  loadingDiv.innerHTML = `<span class="msg-label">L'Oréal Advisor</span>${reply}`;
  chatWindow.scrollTop = chatWindow.scrollHeight;

  return reply;
}

/* Send message to search worker for web-enabled responses */
async function sendToSearchWorker(messages) {
  const messagesWithSystem = [
    {
      role: "system",
      content:
        "You are a friendly L'Oréal beauty advisor with access to the web. When relevant, search for current information about L'Oréal products, ingredients, or beauty trends. You must never use any markdown formatting — no asterisks, no bold, no numbered lists with **, no headers. Write everything as plain conversational text like you are texting a friend. Keep responses concise and include any relevant links naturally in the text.",
    },
    ...messages,
  ];

  /* Show loading indicator */
  const loadingDiv = addMessage("assistant", "...", true);

  const response = await fetch(
    "https://loreal-search-worker.tiqbal1.workers.dev",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messagesWithSystem }),
    },
  );

  const data = await response.json();

  /* Extract text from response */
  const rawReply = data.output
    .filter((item) => item.type === "message")
    .map((item) =>
      item.content
        .filter((c) => c.type === "output_text")
        .map((c) => c.text)
        .join(""),
    )
    .join("");

  /* Strip markdown formatting */
  const reply = rawReply
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/^\d+\.\s/gm, "")
    .replace(/^[-*]\s/gm, "")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
      '<a href="$2" target="_blank">$1</a>',
    )
    .trim();

  /* Replace loading with real response */
  loadingDiv.classList.remove("loading");
  loadingDiv.innerHTML = `<span class="msg-label">L'Oréal Advisor</span>${reply}`;
  chatWindow.scrollTop = chatWindow.scrollHeight;

  return reply;
}

/* Add a message bubble to the chat window */
function addMessage(role, content, isLoading = false) {
  const div = document.createElement("div");
  div.classList.add("msg", role === "user" ? "user" : "ai");
  if (isLoading) div.classList.add("loading");

  const label = role === "user" ? "You" : "L'Oréal Advisor";
  div.innerHTML = `<span class="msg-label">${label}</span>${content}`;

  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return div;
}

/* Generate routine button - collects selected products and sends to AI */
document
  .getElementById("generateRoutine")
  .addEventListener("click", async () => {
    if (selectedProducts.length === 0) {
      alert("Please select at least one product first!");
      return;
    }

    /* Build a product list string with name, brand, category, and description */
    const productList = selectedProducts
      .map((p) => `${p.name} by ${p.brand} (${p.category}): ${p.description}`)
      .join("\n");

    const prompt = `You are a L'Oréal beauty advisor. The user has selected these products:\n\n${productList}\n\nCreate a personalized daily routine using these products. Include morning and evening steps where relevant. Be friendly and specific.`;

    conversationHistory = [{ role: "user", content: prompt }];

    addMessage("user", "Generate a routine with my selected products.");
    const reply = await sendToWorker(conversationHistory);
    conversationHistory.push({ role: "assistant", content: reply });
  });

/* Track selected products */
let selectedProducts = [];

/* Toggle a product selected/unselected */
function toggleProduct(card) {
  const product = JSON.parse(card.dataset.product);
  const index = selectedProducts.findIndex((p) => p.id === product.id);

  if (index === -1) {
    selectedProducts.push(product);
    card.classList.add("selected");
  } else {
    selectedProducts.splice(index, 1);
    card.classList.remove("selected");
  }

  /* Toggle expanded description */
  card.classList.toggle("expanded");

  updateSelectedList();
  saveToLocalStorage();
}

/* Update the Selected Products section */
function updateSelectedList() {
  const list = document.getElementById("selectedProductsList");

  if (selectedProducts.length === 0) {
    list.innerHTML = "<p>No products selected yet.</p>";
    return;
  }

  list.innerHTML = selectedProducts
    .map(
      (p) => `
    <div class="selected-tag" data-id="${p.id}">
      ${p.name}
      <button class="remove-btn" onclick="removeProduct(${p.id})">✕</button>
    </div>
  `,
    )
    .join("");
}

/* Remove a product from the selected list */
function removeProduct(id) {
  selectedProducts = selectedProducts.filter((p) => p.id !== id);

  /* Also remove the highlight from the card in the grid */
  const card = document.querySelector(`.product-card[data-id="${id}"]`);
  if (card) card.classList.remove("selected");

  updateSelectedList();
  saveToLocalStorage();
}

/* Save selected products to localStorage */
function saveToLocalStorage() {
  localStorage.setItem("selectedProducts", JSON.stringify(selectedProducts));
}

/* Load selected products from localStorage */
function loadFromStorage() {
  const saved = localStorage.getItem("selectedProducts");
  if (saved) {
    selectedProducts = JSON.parse(saved);
    updateSelectedList();
  }
}

loadFromStorage();