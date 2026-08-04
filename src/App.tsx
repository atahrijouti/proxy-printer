import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onMount,
  Show,
  type Component,
} from "solid-js";
import _debounce from "lodash/debounce";

import "./fonts.css";
import "./deck-printer.css";

const CARDS_PER_PAGE = 9;
let PP_OVER_FOLDER = "http://localhost:8787/images/overlays";
let PP_CARD_FRONT_FOLDER = "http://localhost:8787/images/card-front";
let PP_CARD_BACK_URL = "http://localhost:8787/images/card-back.jpg";
const STARTING_URL = "http://localhost:8787/db.json";
const STARTING_DECK = `1 Ariel - On Human Legs
`;

type Card = {
  id: string;
  imageUrl: string;
  fullText: string;
  name: string;
  version: string;
  type: string;
  classification: string;
  subtypes: string[];
  overlays: string[];
  // cost: number
  // inkwell: boolean
  // attack: number
  // defence: number
  // color: string
  // flavour: string | null
  // separator: string | null
  // stars: number
  // number: number
  // rarity: string
};

type PageData = {
  cards: Partial<Card>[];
};

const Overlay: Component<{ url: string }> = (props) => {
  return (
    <img src={`${PP_OVER_FOLDER}/${props.url}`} class="img overlay radius" />
  );
};

const Image: Component<Partial<Card>> = (props) => {
  let textEl: HTMLDivElement | undefined;

  onMount(() => {
    if (!textEl) {
      return;
    }

    const height = textEl.clientHeight;
    if (height < 88) {
      return;
    }
    console.log(textEl.parentElement, height);
    textEl.style.setProperty("font-size", "9px");
  });

  return (
    <div
      class={`card-sleeve ${(props as { type?: string }).type?.toLowerCase() ?? ""}`}
    >
      <img src={`${props.imageUrl}`} class="img radius" />
      <For each={props.overlays}>{(overlay) => <Overlay url={overlay} />}</For>
      <span class="name overlay">{props.name}</span>
      <Show when={props.version?.length}>
        <span class="title overlay">{props.version}</span>
      </Show>
      <span class="traits overlay">{props.classification}</span>
      <div class="text-container overlay">
        <div class="text" ref={textEl} innerHTML={props.fullText ?? ""} />
      </div>
    </div>
  );
};

const Page: Component<PageData> = (props) => {
  return (
    <div class="page">
      <For each={props.cards}>{(card) => <Image {...card} />}</For>
    </div>
  );
};

const CardList: Component<{ list: Card[] }> = (props) => {
  const pages = createMemo<PageData[]>(() => {
    const result: PageData[] = [];

    for (let i = 0; i < props.list.length; i += CARDS_PER_PAGE) {
      result.push({
        cards: props.list.slice(i, i + CARDS_PER_PAGE),
      });
    }

    return result;
  });

  return <For each={pages()}>{(page) => <Page cards={page.cards} />}</For>;
};

const CardBackList: Component = () => {
  return (
    <Page
      cards={Array.from({ length: 9 }).map(() => ({
        imageUrl: PP_CARD_BACK_URL,
        id: "Card Back",
      }))}
    />
  );
};

const mapPrompt = (db: Card[], prompt: string) => {
  if (!db.length) {
    return [];
  }
  if (prompt.trim() === "") {
    return db;
  }
  const lines = prompt.split("\n");
  const cards: Card[] = [];
  lines.forEach((line) => {
    const matches = line.match(/^(\d+)\s(.*)$/);

    if (!matches) {
      return;
    }

    const count = Number(matches[1]);
    const id = matches[2];
    const card = db.find((entry) => entry.id === id.toLowerCase());

    if (!card) {
      return;
    }

    Array.from({ length: count }).forEach(() => cards.push(card));
  });
  return cards;
};

const App: Component = () => {
  const [isCardBack, setIsCardBack] = createSignal(false);
  const [deckName, setDeckName] = createSignal("Deck");
  const [displayedCards, setDisplayedCards] = createSignal<Card[]>([]);
  const [dictUrl, setDictUrl] = createSignal<string>(STARTING_URL);
  const [cardDict, setCardDict] = createSignal<Card[]>([]);
  const [cardPrompt, setCardPrompt] = createSignal<string>(STARTING_DECK);

  const processDict = (data: any) => {
    setCardDict(
      data.cards.map((card: Card) => {
        return {
          ...card,
          imageUrl: `${PP_CARD_FRONT_FOLDER}/${card.imageUrl}`,
        };
      }),
    );

    PP_CARD_BACK_URL = `${data.baseUrl}/images/card-back.jpg`;
    PP_OVER_FOLDER = `${data.baseUrl}/${data.overlayPath}`;
    PP_CARD_FRONT_FOLDER = `${data.baseUrl}/${data.cardPath}`;
  };

  const fetchDict = _debounce((url: string) => {
    const asyncCall = async () => {
      try {
        const response = await fetch(url);
        const data = await response.json();
        processDict(data);
      } catch (e) {
        setCardDict([]);
        console.log("couldn't fetch json");
      }
    };
    asyncCall();
  }, 500);

  const rebuildList = _debounce((dict: Card[], prompt: string) => {
    setDisplayedCards(mapPrompt(dict, prompt));
  }, 500);

  createEffect(() => {
    fetchDict(dictUrl());
  });

  createEffect(() => {
    if (isCardBack()) {
      document.body.classList.add("card-back");
      document.title = "Card Back";
    } else {
      document.body.classList.remove("card-back");
      document.title = deckName();
    }
  });

  createEffect(() => {
    rebuildList(cardDict(), cardPrompt());
  });

  return (
    <>
      <aside class="controls no-print">
        <div>
          <label>
            Card backs
            <input
              type="checkbox"
              value="Card Backs"
              onChange={() => setIsCardBack(!isCardBack())}
              checked={isCardBack()}
            />
          </label>
        </div>
        <div>
          <input
            type="text"
            onInput={(e) => setDictUrl(e.currentTarget.value)}
            value={dictUrl()}
          />
        </div>
        <div>
          <input
            type="text"
            onInput={(e) => setDeckName(e.currentTarget.value)}
            value={deckName()}
          />
        </div>
        <div>
          <textarea
            class="card-prompt"
            onInput={(e) => setCardPrompt(e.currentTarget.value)}
            value={cardPrompt()}
          />
        </div>
      </aside>
      <main>
        <Show
          when={isCardBack()}
          fallback={<CardList list={displayedCards()} />}
        >
          <CardBackList />
        </Show>
      </main>
    </>
  );
};

export default App;
