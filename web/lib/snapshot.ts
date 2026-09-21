/**
 * A captured PreStocks universe, used only when the issuer API cannot be reached.
 *
 * Captured 2026-09-19T17:37:53Z from https://prestocks.com/api/prestocks.
 *
 * The site prefers live data and falls back to this rather than throwing, so a
 * flaky network degrades the page instead of breaking it. When the fallback is
 * in use the UI says so — a stale mark silently presented as live would be worse
 * than no mark at all, because the whole product is a claim about prices.
 */
export const SNAPSHOT_CAPTURED_AT = "2026-09-19T17:37:53Z";

export const SNAPSHOT_ASSETS = [
  {
    "symbol": "ANDURIL",
    "name": "Anduril PreStocks",
    "description": "Anduril builds AI-driven defense systems, including autonomous drones and perimeter sensors. Their platforms integrate real-time data and computer vision to enhance situational awareness for military and border security applications.  ANDURIL is a PreStocks issued token backed 1:1 by SPV exposure that tracks the price of the underlying private company.",
    "mint": "PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB",
    "image": "https://www.prestocks.com/logos/anduril.png",
    "markPrice": 152.87330975,
    "tokenPrice": 149.08340001023632,
    "supply": 11805.861417523,
    "impliedValuation": 131893943446.0,
    "markValuation": 135246873020.0,
    "premiumBps": 254
  },
  {
    "symbol": "ANTHROPIC",
    "name": "Anthropic PreStocks",
    "description": "Anthropic is an AI research company developing Claude, a language model built with a strong focus on safety and interpretability. Their approach emphasizes ethical guardrails and transparent behavior to reduce the risk of harmful outputs while enabling sophisticated natural language capabilities.  ANTHROPIC is a PreStocks issued token backed 1:1 by SPV exposure that tracks the price of the underlying private company.",
    "mint": "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw",
    "image": "https://www.prestocks.com/logos/anthropic.png",
    "markPrice": 1021.05409327,
    "tokenPrice": 1015.558699936529,
    "supply": 7381.893968911,
    "impliedValuation": 1663832779475.0,
    "markValuation": 1672836114846.0,
    "premiumBps": 54
  },
  {
    "symbol": "FIGUREAI",
    "name": "Figure AI PreStocks",
    "description": "Figure AI builds general-purpose humanoid robots for homes and industrial work. Their robots learn to operate in unstructured real-world environments using neural networks.  FIGUREAI is a PreStocks issued token backed 1:1 by SPV exposure that tracks the price of the underlying private company.",
    "mint": "PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd",
    "image": "https://www.prestocks.com/logos/figureai.png",
    "markPrice": 182.05878373,
    "tokenPrice": 176.0407089885841,
    "supply": 3012.913331574,
    "impliedValuation": 38381624850.0,
    "markValuation": 39693727536.0,
    "premiumBps": 342
  },
  {
    "symbol": "KALSHI",
    "name": "Kalshi PreStocks",
    "description": "Kalshi is a CFTC-regulated prediction market where users trade event contracts on real-world outcomes. Contract prices reflect implied probabilities for events across politics, economics, sports, and more.  KALSHI is a PreStocks issued token backed 1:1 by SPV exposure that tracks the price of the underlying private company.",
    "mint": "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua",
    "image": "https://www.prestocks.com/logos/kalshi.png",
    "markPrice": 893.32669499,
    "tokenPrice": 895.7943092512159,
    "supply": 904.897462014,
    "impliedValuation": 32581878126.0,
    "markValuation": 32492125930.0,
    "premiumBps": -28
  },
  {
    "symbol": "NEURALINK",
    "name": "Neuralink PreStocks",
    "description": "Neuralink develops implantable brain-computer interfaces designed to enable direct communication between the human brain and computers. Their technology aims to treat neurological conditions and eventually augment human capabilities.  NEURALINK is a PreStocks issued token backed 1:1 by SPV exposure that tracks the price of the underlying private company.",
    "mint": "PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S",
    "image": "https://www.prestocks.com/logos/neuralink.png",
    "markPrice": 330.45299478,
    "tokenPrice": 408.83275881017374,
    "supply": 2595.336219579,
    "impliedValuation": 77880616629.0,
    "markValuation": 62949659600.0,
    "premiumBps": -1917
  },
  {
    "symbol": "OPENAI",
    "name": "OpenAI PreStocks",
    "description": "OpenAI pioneers large-language models like GPT and DALL\u00b7E, enabling advanced AI applications. Their research emphasizes both cutting-edge capability and responsible deployment strategies.  OPENAI is a PreStocks issued token backed 1:1 by SPV exposure that tracks the price of the underlying private company.",
    "mint": "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
    "image": "https://www.prestocks.com/logos/openai.png",
    "markPrice": 987.4601734351536,
    "tokenPrice": 1130.8375459339568,
    "supply": 2826.4683352765474,
    "impliedValuation": 1401028897601.0,
    "markValuation": 1223394326786.0,
    "premiumBps": -1268
  },
  {
    "symbol": "POLYMARKET",
    "name": "Polymarket PreStocks",
    "description": "Polymarket is a decentralized prediction market for real-world events. It leverages blockchain technology and market-driven pricing to provide real-time implied probabilities across politics, economics, sports, and more.  POLYMARKET is a PreStocks issued token backed 1:1 by SPV exposure that tracks the price of the underlying private company.",
    "mint": "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP",
    "image": "https://www.prestocks.com/logos/polymarket.png",
    "markPrice": 144.08047011,
    "tokenPrice": 142.3138287788813,
    "supply": 4817.136182732,
    "impliedValuation": 14035810015.0,
    "markValuation": 14210046365.0,
    "premiumBps": 124
  },
  {
    "symbol": "SPACEX",
    "name": "SpaceX PreStocks",
    "description": "SpaceX engineers reusable launch vehicles and the Starlink satellite constellation for global broadband. Their focus on rapid reusability and vertical integration drives down launch costs and accelerates space access.  SPACEX is a PreStocks issued token backed 1:1 by SPV exposure that tracks the price of the underlying private company.",
    "mint": "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh",
    "image": "https://www.prestocks.com/logos/spacex.png",
    "markPrice": 152.944270498919,
    "tokenPrice": 122.61769336914946,
    "supply": 43712.534155535,
    "impliedValuation": 1607654201951.0,
    "markValuation": 2005269324319.0,
    "premiumBps": 2473
  }
] as const;
