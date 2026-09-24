// Initial reference data. Everything here is editable afterwards from the Admin Dashboard.

export const ATOLLS: { code: string; name: string; islands: string[] }[] = [
  { code: "MLE", name: "Malé City", islands: ["Malé", "Hulhumalé", "Villimalé", "Hulhulé"] },
  { code: "HA", name: "Haa Alifu", islands: ["Dhidhdhoo", "Hoarafushi", "Ihavandhoo", "Kelaa", "Baarah", "Utheemu", "Filladhoo", "Maarandhoo", "Thakandhoo", "Vashafaru", "Muraidhoo", "Molhadhoo", "Thuraakunu", "Uligamu"] },
  { code: "HDh", name: "Haa Dhaalu", islands: ["Kulhudhuffushi", "Hanimaadhoo", "Nolhivaranfaru", "Nellaidhoo", "Kumundhoo", "Hirimaradhoo", "Neykurendhoo", "Vaikaradhoo", "Makunudhoo", "Kurinbi", "Nolhivaram", "Naivaadhoo", "Finey", "Kunburudhoo"] },
  { code: "Sh", name: "Shaviyani", islands: ["Funadhoo", "Milandhoo", "Komandoo", "Kanditheemu", "Maaungoodhoo", "Feevah", "Lhaimagu", "Foakaidhoo", "Goidhoo", "Narudhoo", "Noomaraa", "Feydhoo", "Bileffahi", "Maroshi"] },
  { code: "N", name: "Noonu", islands: ["Manadhoo", "Velidhoo", "Holhudhoo", "Kendhikulhudhoo", "Miladhoo", "Lhohi", "Maafaru", "Fodhdhoo", "Landhoo", "Maalhendhoo", "Magoodhoo", "Henbandhoo"] },
  { code: "R", name: "Raa", islands: ["Ungoofaaru", "Dhuvaafaru", "Alifushi", "Maduvvari", "Meedhoo", "Kinolhas", "Inguraidhoo", "Hulhudhuffaaru", "Innamaadhoo", "Maakurathu", "Rasmaadhoo", "Vaadhoo", "Angolhitheemu", "Fainu", "Rasgetheemu", "Ugulu"] },
  { code: "B", name: "Baa", islands: ["Eydhafushi", "Thulhaadhoo", "Dharavandhoo", "Hithaadhoo", "Kendhoo", "Kihaadhoo", "Kudarikilu", "Goidhoo", "Fehendhoo", "Fulhadhoo", "Maalhos", "Dhonfanu", "Kamadhoo"] },
  { code: "Lh", name: "Lhaviyani", islands: ["Naifaru", "Hinnavaru", "Kurendhoo", "Olhuvelifushi"] },
  { code: "K", name: "Kaafu", islands: ["Thulusdhoo", "Maafushi", "Guraidhoo", "Huraa", "Himmafushi", "Dhiffushi", "Gulhi", "Kaashidhoo", "Gaafaru", "Thilafushi", "Gulhifalhu"] },
  { code: "AA", name: "Alifu Alifu", islands: ["Rasdhoo", "Ukulhas", "Thoddoo", "Mathiveri", "Bodufolhudhoo", "Feridhoo", "Maalhos", "Himandhoo"] },
  { code: "ADh", name: "Alifu Dhaalu", islands: ["Mahibadhoo", "Dhangethi", "Dhigurah", "Omadhoo", "Maamigili", "Fenfushi", "Mandhoo", "Hangnaameedhoo", "Kunburudhoo", "Dhidhdhoo"] },
  { code: "V", name: "Vaavu", islands: ["Felidhoo", "Fulidhoo", "Keyodhoo", "Thinadhoo", "Rakeedhoo"] },
  { code: "M", name: "Meemu", islands: ["Muli", "Dhiggaru", "Kolhufushi", "Veyvah", "Mulah", "Maduvvari", "Naalaafushi", "Raiymandhoo"] },
  { code: "F", name: "Faafu", islands: ["Nilandhoo", "Magoodhoo", "Dharanboodhoo", "Feeali", "Bileddhoo"] },
  { code: "Dh", name: "Dhaalu", islands: ["Kudahuvadhoo", "Meedhoo", "Bandidhoo", "Rinbudhoo", "Hulhudheli", "Gemendhoo", "Vaanee", "Maaenboodhoo"] },
  { code: "Th", name: "Thaa", islands: ["Veymandoo", "Thimarafushi", "Guraidhoo", "Kinbidhoo", "Vilufushi", "Madifushi", "Dhiyamigili", "Hirilandhoo", "Gaadhiffushi", "Kandoodhoo", "Omadhoo", "Buruni", "Vandhoo"] },
  { code: "L", name: "Laamu", islands: ["Fonadhoo", "Gan", "Isdhoo", "Dhanbidhoo", "Maabaidhoo", "Mundoo", "Kalaidhoo", "Maamendhoo", "Hithadhoo", "Kunahandhoo", "Maavah"] },
  { code: "GA", name: "Gaafu Alifu", islands: ["Viligili", "Dhaandhoo", "Dhevvadhoo", "Gemanafushi", "Kanduhulhudhoo", "Kolamaafushi", "Kondey", "Maamendhoo", "Nilandhoo"] },
  { code: "GDh", name: "Gaafu Dhaalu", islands: ["Thinadhoo", "Gadhdhoo", "Rathafandhoo", "Fiyoaree", "Faresmaathodaa", "Hoadedhoo", "Madaveli", "Nadellaa", "Vaadhoo"] },
  { code: "Gn", name: "Gnaviyani (Fuvahmulah)", islands: ["Fuvahmulah"] },
  { code: "S", name: "Seenu (Addu City)", islands: ["Hithadhoo", "Maradhoo", "Maradhoo-Feydhoo", "Feydhoo", "Hulhudhoo", "Meedhoo"] },
];

export const LOCATIONS: Record<string, Record<string, string[]>> = {
  MLE: {
    "Malé": ["Henveiru", "Galolhu", "Maafannu", "Machchangolhi"],
    "Hulhumalé": ["Phase 1", "Phase 2"],
  },
  Gn: { Fuvahmulah: ["Dhadimago", "Dhiguvaandu", "Hoadhadu", "Maadhadu", "Miskiymago", "Funaadu", "Maalegan", "Dhoondigan"] },
  S: { Hithadhoo: ["North", "South"] },
};

export const CATEGORIES: { name: string; icon: string; subs: string[] }[] = [
  { name: "Electronics", icon: "🔌", subs: ["TVs & Audio", "Cameras", "Gaming", "Home Appliances", "Accessories"] },
  { name: "Phones", icon: "📱", subs: ["Smartphones", "Tablets", "Smartwatches", "Phone Accessories"] },
  { name: "Computers", icon: "💻", subs: ["Laptops", "Desktops", "Monitors", "Parts & Components", "Printers"] },
  { name: "Vehicles", icon: "🛵", subs: ["Motorcycles & Scooters", "Cars", "Bicycles", "Boats & Dhonis", "Vehicle Parts"] },
  { name: "Property", icon: "🏠", subs: ["Apartments for Rent", "Rooms for Rent", "For Sale", "Commercial Space", "Land"] },
  { name: "Furniture", icon: "🛋️", subs: ["Living Room", "Bedroom", "Office", "Outdoor"] },
  { name: "Clothing", icon: "👕", subs: ["Men", "Women", "Kids", "Shoes", "Bags & Accessories"] },
  { name: "Home & Garden", icon: "🪴", subs: ["Kitchen", "Decor", "Garden & Plants", "Tools"] },
  { name: "Sports", icon: "🏄", subs: ["Water Sports", "Fishing", "Fitness", "Football", "Outdoor"] },
  { name: "Food", icon: "🥥", subs: ["Home-made", "Fresh Produce", "Seafood", "Snacks & Drinks"] },
  { name: "Services", icon: "🛠️", subs: ["Repairs", "Cleaning", "Tuition", "Transport", "Events"] },
  { name: "Jobs", icon: "💼", subs: ["Full-time", "Part-time", "Freelance"] },
  { name: "Business", icon: "🏪", subs: ["Equipment", "Businesses for Sale", "Wholesale"] },
  { name: "Other", icon: "📦", subs: [] },
];

export const SELLER_LEVELS = [
  { name: "New Seller", slug: "new-seller", badge: "🌱", color: "#64748b", minStars: 0, minDeals: 0, description: "Welcome to MV Markets!" },
  { name: "Active Seller", slug: "active-seller", badge: "⚡", color: "#0891b2", minStars: 3, minDeals: 3, description: "Completed their first successful deals." },
  { name: "Experienced Seller", slug: "experienced-seller", badge: "🏅", color: "#0e7490", minStars: 10, minDeals: 10, description: "A proven, reliable seller." },
  { name: "Top Seller", slug: "top-seller", badge: "🏆", color: "#b45309", minStars: 25, minDeals: 25, description: "One of the most active sellers." },
  { name: "Marketplace Star", slug: "marketplace-star", badge: "🌟", color: "#7c3aed", minStars: 50, minDeals: 50, description: "An MV Markets legend." },
];

export const PLANS = [
  { name: "Business Starter", description: "For small shops getting started online.", price: 50000, durationDays: 30, freeListingsPerPeriod: 30, featuredSlots: 1, features: ["Business storefront page", "Logo & branding", "30 fee-free listings per month", "1 featured listing", "Listing analytics"] },
  { name: "Business Pro", description: "For established businesses with large inventory.", price: 150000, durationDays: 30, freeListingsPerPeriod: 200, featuredSlots: 5, features: ["Everything in Starter", "200 fee-free listings per month", "5 featured listings", "Verified business badge eligibility", "Priority support"] },
];

export const TERMS = `# MV Markets Terms of Use

Welcome to MV MARKETS by OceanX ("MV Markets"). By creating an account you agree to these terms.

## 1. The marketplace
MV Markets connects buyers and sellers in the Maldives. Transactions are made directly between buyer and seller. MV Markets does not take a commission on the sale price.

## 2. Posting fees
Publishing a listing requires a one-time posting fee shown before payment. VIP sellers receive the VIP posting fee. Fees are non-refundable once a listing is published, except where OceanX decides otherwise.

## 3. Payment verification
Payment slips are screened with automated tools and reviewed by OceanX staff. Uploading altered or re-used slips is prohibited.

## 4. Keeping listings available
Once published, a listing should stay available until sold. Voluntarily withdrawing a published listing may incur the cancellation fee displayed before you confirm. No fee applies to drafts, unpublished listings, listings removed by OceanX, or items marked as sold.

## 5. Stars, levels and VIP
Stars, seller levels and VIP status are earned through genuine completed sales. Manipulating statistics (fake deals, duplicate listings, fake referrals) may lead to loss of status and account suspension.

## 6. Prohibited items
Illegal goods, weapons, drugs, alcohol, pork products, counterfeit items and anything prohibited under Maldivian law may not be listed.

## 7. Account suspension
OceanX may suspend accounts that violate these terms.`;

export const PRIVACY = `# MV Markets Privacy Policy

We collect the information you give us (name, email, phone, listings, messages and payment slips) to operate the marketplace.

- **Payment slips** are stored privately and are only visible to you and authorised OceanX staff.
- **Phone numbers** are shown on your listings only if you choose to show them.
- **Photos** you upload are processed to remove location metadata.
- We use automated tools (including AI) to help screen payment slips. Final decisions are made by people.
- We never sell your personal data.

Contact support to request a copy or deletion of your data.`;
