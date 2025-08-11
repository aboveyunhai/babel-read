# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)



# My 5-day intensive Vibe Coding experience building a Tauri app as a web dev


Long post ahead (\~4200 words, 15-20mins), feel free to read it if you’re interested or just have some time to kill.  
**TL;DR:** Skip to the **Conclusion AI section.**

Over the past six months, I’ve seen countless AI-related posts on Twitter, Reddit, and YouTube. Honestly, most of them are hard to judge and in many cases, kind of meaningless to me. They’re usually vague, lack context, or are overly emotional. (If you’ve ever watched Primeagen’s YouTube videos and seen how he reacts to vibe coding, you’ll know what I mean.)

So, I documented my VC (Vibe Code :p) experience of a Tauri app in as much detail as possible, down to the code level. I’ll cover every feature, what worked well, and what didn’t.

Instead of the typical *“refactor/rewrite AI code”* complaint, "*XXX 4.1 feels like a big leap comparing to 4*", or a *“one-shot, build-the-whole-app”* story. I’ll also try to offer my “objective” take on the AI’s capabilities.

Since my own feelings about it are pretty mixed, I decided to share my experience in reddit, hopefully it gives others some useful insights.

# The Cause:

It all started one day when I wanted to translate some Korean live chat text in a recorded gaming livestream. I was just curious what the Korean audience thought about the game. I first tried out an open-source project called [Translumo](https://github.com/Danily07/Translumo) but it only showed translations without the original text. The translation quality also felt low compared to today's AI models.

As a bilingual, I’ve always wished subtitles could include both the original text and the translation, so I can understand where each translation comes from. (Netflix, YouTube still no such feature to this day.)

So, I forked the library and tried to modify it for my own needs. I got it semi-working, but adding even simple features like small UI tweaks and GPT-based translations, I have to dig through 8+ layers of classes, getters and setters. That drove me mad. Don't get me wrong, Translumo is still an amazing and ambitious project. I just personally hate excessive class abstractions from the language/framework itself.

Since people have been talking a lot about how good vibe coding is lately, I thought, “Why don’t I just vibe one for myself from scratch?” After all, the core idea of the app was actually simple.

I picked Tauri (2.0) mainly because it was trendy, many people claimed it to be a better Electron (nothing technical),t he UI is a WebView, meaning I could reuse my frontend skills while picking up some Rust along the way.

Here is the setup:

AI: Paid Copilot (Model: Claude Sonnet 4) with VSCode (sorry neovim and cursor user).

Me: Web dev (mid-senior level?) who knows nothing about Rust and Tauri

The goal on paper was pretty "straightforward":

1. A **"main" window** with screenshot and recording buttons
2. A **sub "overlay" window** that can be resized and dragged, with transparent content so I can see through it
3. When I click “Recording,” it should take a screenshot of the overlay’s transparent area once per given second, run it through OCR (Optical Character Recognition) to extract text, and then send the text to a translation service (whatever’s fast)
4. Display the final results in real time back in “main” window。

# The Honeymoon phase: (90% AI code)

The initial phase went surprisingly smoothly, far beyond my expectations. GPT nailed almost every single feature on the first try, such as:

* “Add a toggle button in the main window that allows the user to open/close a new overlay window.”
* “Screenshot the whole screen.”
* “Display the result in the main window.”
* “Add resize/minimize functionalities to the overlay window.”
* “Screenshot the whole screen or just the area based on the overlay size.”

There were a few subtle syntax issues, but most were minor and I could fix them immediately on the client side. On the backend, the Rust compiler caught all the type issues (`u32` → `i32`, missing `Some()` for `Optional<>`), and Copilot could auto-fix them based on the compiler error messages.

The only weird one worth mentioning was when it implemented the `overlay.tsx` window. It generated two identical `useEffect` hooks. One in `main.tsx` and one in `overlay.tsx`, both checking the window identity. Initially, I couldn’t figure out what it was trying to do. Removing the one in `overlay.tsx` seemed to have no effect.

I asked GPT to clarify, and it said that removing them would cause the window content text to “leak” to other windows, which was true. But its explanation was pretty vague for me at that moment.

Soon I realized it was trying to mimic OS-level `Router` behavior. The code just looked duplicated. Once I gave Copilot the term “Router” as a hint, it refactored everything into a proper `<Router />` structure in one prompt.

Another quirk came from the default Tauri template, which includes a `main.css` for `main.tsx`. Every time I asked Copilot to add or remove something in a `.tsx` file, it tried way too hard to mimic that pattern: re-creating or updating `overlay.css` with a bunch of irrelevant CSS. The incorrect router code I mentioned earlier (before I fixed it) also caused CSS scope issues.

In the end, I completely removed those CSS files so it would stop following that pattern, and switched to Tailwind (sorry, Tailwind haters). Strangely, Copilot handled styling much better once local CSS and JS were in the same scope. In hindsight, I could have just told Copilot from the start: “Don’t generate extra CSS files.”

Everything was blazing fast. GPT felt very promising. I could feel the vibe aura and totally understood why so many people are excited about it. I even thought I might finish the project in 2–3 days.  
But soon, I hit my first brick wall.

# The real struggle began:

1. **make Overlay windows content transparent. (50% AI)**

I wanted the overlay window to be both **transparent** and **click-through**, since most similar screen tools offer such behavior: A floating window you can see through and interact with whatever’s behind it, as if the overlay isn’t really “there.”

This is where Copilot started to hallucinate. Initially, it correctly made the window unclickable and the background transparent via Tauri’s official APIs. After that, progress completely stalled.

In the frontend (typescript), Copilot kept generating piles of unrelated JavaScript code that had nothing to do with the problem.

I suspect it’s because the training data is heavily dominated by typical web app scenarios, so it kept trying to match random patterns from unrelated web projects. But the problem is specifically to Windows OS.

Worse, it kept re-inserting some useless drag-and-drop attributes from my earlier failed attempts, which I had copied from a GitHub discussion. Somehow, these stuck in the context, and Copilot insisted on using them, possibly because the attribute name "drag-area-content" (or something similar) was too generic and interfere with the existing training data.

In the backend (Rust), Copilot repeatedly invented non-existent Tauri APIs that wouldn’t even compile. Well, at least the names of those APIs seemed like they could solve the problem.

After 1+ hour of prompting and frustration. I went back to my usual method: good old-fashioned Googling and GitHub repo diving. That turned out to be a "hard" question in Tauri due to its architecture (WebView frontend + Rust backend). You can't selectively make only part of a WebView transparent easily, you can only control the entire window’s transparency. Even Electron struggles with similar issues.

I also experimented with some Rust-based approaches that tracked the user’s cursor position and the window layout, to dynamically toggle click-through behavior. Unfortunately, they were too resource-hungry. Conceptually, I think it’s the right approach under the current setup, but my Rust skills weren’t up to the challenge.

Eventually, I gave up the Rust approach and somehow came up a hacky client-side workaround:

When the cursor moves into the transparent content (a transparent `<div>` inside the WebView), I fire an API call to make the entire window click-through. When the cursor moves back over other content, I fire another API to restore normal interaction behavior. Since I’d be constantly moving in and out of the transparent area, I added a debounce to delay the toggle, making smooth interactions.

Nothing technical, purely UX gimmick based on user (my) expectations. It turned out performing surprisingly well. The solution isn’t generic and only fits the app I was building, with minor issues. I did let AI autocomplete the debounce function, but overall, AI didn’t provide anything useful. All my ideas inspired by some GitHub discussions. If you wonder how it looks like:
![xxzx1](https://github.com/user-attachments/assets/2a5370d1-1bc5-4063-bd74-949b10b9da26)

2) **Adding Windows OCR Support (10% AI)**

I initially tried using a third-party OCR library (uniocr) to extract text from images, but it had dependency issues I couldn’t figure out or fix.

When I asked Copilot for help, I felt like I got roasted. It surprisingly suggested me to write the whole OCR functionality myself, like a senior dev educating you not to rely too much on third-party libraries.

Well, since that's what it asked for, I let Copilot try it then. It generated 100+ lines of code, multiple functions, and abstractions to access Windows OCR APIs. Despite its confidence, multiple attempts, none of them worked.

In the end, I went through the source code of that third-party library I had previously tried to use. It turned out to be just a simple function (under 100 lines) for Windows, even though I didn’t fully understand most of the Rust code or syntax. I copied and pasted it with minimal modifications, and it worked flawlessly.

3) **Side Quest: Integrate Python Module (easy-ocr) into Tauri Project (5% AI)**

Many LLM/OCR modules are written in Python, and with my limited Rust knowledge, porting them wasn’t feasible. Running Python code directly was more practical.

Here, AI was basically useless because the problem was highly specific to Tauri’s project structure and window system integration.

I had to set up a Python virtual environment (venv) as a submodule inside the Rust folder and bind it into the project during build. At first, I couldn’t get any third-party Python libraries to run. `Tauri build` couldn’t find the modules even though they were installed inside the `venv`. Copilot repeatedly suggested random nonsense like “you didn’t install the module properly” or told me to install/uninstall libraries and clear the build cache.

After inspecting the Tauri build cache, I discovered it was using the global system Python path instead of the project’s virtual environment, no matter how I tweaked configs.

Searching GitHub issues, I found others had the same problem. One comment suggested a workaround: inject the local module path directly into the Python script. That finally made it work during build time.

For this feature, The only part I vibe-coded myself was the Python `easy-ocr` API implementation. Even then, Copilot struggled with context: when I tried sending JSON data from Python (backend) to JavaScript (frontend), I immediately notice  data-type incompatibility because I wasn’t formatting JSON properly. Even that part Copilot failed to understand some of the contexts:

When I try to send JSON data from python (backend) to JavaScript (frontend), I immediately noticed the data-type incompatibility issue between two languages. I didn't handle JSON format properly. Oddly, when I asked Copilot to format the data as JSON, it kept returning a plain Python object. Probably because I didn’t use terms like `REST API` or the code context was not looking like typical Python web frameworks like Django.

Online search by myself again, first Google result: use `json.dumps()`. Problem solved.

4) **Attempt to Enhance OCR Results (–50% AI)**

By now, I could take screenshots and convert them into text, but the output was just raw text fragments from the image. For my needs like subtitle translation, I could simply merge these into a sentence.

However, I wanted better results since the OCR output included spatial data for each character. So I tried instructing the AI to:

* Group characters based on their x, y positions and font size
* Define distance and size thresholds
* Compute grouped characters into sentences and dynamically adjust layout
* ...and many more

No matter what prompts I tried, even silly ones like "You are a senior Google engineer" or swap the model (Claude 3.7 Thinking, GPT-4.1, o4-mini, etc.), the results stayed unusable and arbitrary. Copilot kept hallucinating JavaScript code, repeatedly inserting `"getClientRect()"`. It seemed allergic to the term “layout,” always spitting out JS rect APIs inside Rust code.

For testing, I added sample images with expected input/output, which made things worse. The model tried to hardcode solutions based on the expected output, checking if the output started with specific terms to decide how to group characters.

Though I had ideas, I couldn’t write meaningful Rust code myself yet, having never written any before. After countless hours and over 2000 lines of broken Rust code generated and twisted around, I gave up on improving this part.

# The Final and Clean Up phase (80% AI)

The “Recording” feature essentially captures a screenshot and extracts text every X milliseconds, which was easy to implement using `setInterval`. GPT nailed this in one shot.

Initially, the screenshot code converted the image buffer to a base64 string before processing, which was slow (about 600ms for a WebP and 1 second for a full-screen (2560x1440) PNG). Then I realized the OCR API can consume the image buffer directly, allowing me to skip the slow conversion and go straight from buffer to text during recording.

To my surprise, Copilot failed several times for no apparent reason, even though all the functions were ready. I had to manually refactor the code, extracting the buffer-generation part from the screenshot function into a separate function, then handling buffer -> base64 for screenshots and buffer -> text for recording respectively.

My refactor was broken because I didn’t fully understand data-type conversion and bitmaps in Rust, but that was enough for Copilot to step in and fix the rest.

The final step was translating the OCR text and displaying it below the original. GPT handled most of the frontend work. I used OpenAI’s API to translate incoming text and added a simple cache to avoid duplicate translations and save costs.

Here’s how the whole app looks after combining everything above:

![xxzx2](https://github.com/user-attachments/assets/8ec4664f-4330-4a80-94aa-11f8bf40c442)


# In Conclusion:

Project itself:

1. In total, I probably spent over 30 hours on the project, vibe more than 10000+ lines of code. Majority of them were discarded. Half of the time was actually on researching rather than coding anything. For example, I spent significant amount of hours on testing the local Surya OCR / easy OCR model, but it was too slow. I need a better machine with a better GPU to test out the speed.
2. The project was in raw stage. I need to figure out how to install Windows language packs in app (on runtime) for each OCR language Missing all kinds of caching, text dedupe, optimization, etc. My ideal approach would be using local LLM for both translation and OCR detection.
3. At least the idea itself was validated.
4. Translumo is a very cool project. Only when you start working on something similar do you realize how much effort people put in, and you begin to appreciate the details behind the scenes, including the many optimizations and caching techniques involved. My toy version is not even remotely close.

**Tauri:**

**1.** As much as I love the web, I am still not convinced that Tauri is a good idea (At least for the app I was trying to build), or that using WebView is the right choice, even though it is probably the most platform-compatible technology we could choose. WebView essentially keeps Tauri always playing catch-up with Electron’s compatibility.

If you’re building something with a complex UI that needs native system interaction, you might be better off using tools that can fully access and utilize native UI features.

Maybe someday I should try out Qt or another framework that lets me build non-web UIs, or use Tauri for something that is extremely frontend-intensive, so I can give it a fair judgment.

**2.** Avoid using Python in Tauri. If possible, write Rust ports for those libraries instead. This might be difficult, especially since many LLM-related libraries today are written in Python.

From my experience, including Python adds a huge amount of overhead and significantly slows down build and development compile times in this case,

I made an even worse mistake (on purpose, for testing): the bundler actually included a local OCR model. That alone made the whole app over 1GB. Ideally, I should have made it optional and allowed the user to download the model at runtime.

You will also experience extremely slow startup times.

I’ve also seen solutions where people use a Python backend instead of Rust so they can better integrate Python-based LLM tools. But then I have to ask, what’s the point of using Tauri? In my honest opinion, Rust is one of Tauri’s main selling points.

**3.** I wish Tauri’s production build could output a zip file or a single `.exe` for simple Windows apps. I miss the old Windows days when you could just unzip and run an `.exe` without dealing with an installer. Installers are annoying.

**Prompt:**

**1.** Typed languages are superior for LLMs, as Copilot can directly apply code changes, compile them to check for errors, and iterate until the issues are resolved..

**2.** Unless you’re unsure about what you want initially, be explicit and always include rules like: "Don’t generate extra files." "Don’t touch specific functions if unrelated." "Don’t refactor existing functions." "The result should only include the changes you want to make." "Don’t explain the code, output code only." Doing this can greatly reduce token costs and the amount of duplicated code generated.

When generating code, don’t let Copilot add explanations or descriptions of the new code it generates, unless you specifically want to track each prompt and save those descriptions in a log file for git history. I often find those descriptions useless. They just mirror or flatter what you asked for and are often unrelated to the quality of actual code.

**3.** I find the whole idea of “LLM Context” (more context/codebase = better output) rather questionable.

I think it’s mostly complex pattern matching, not genuine reasoning. When you input more, the model just mathematically has more data to explicitly pattern match against its training data. It can't even give you a deterministic confidence score, hard to differentiate the context/noise. You sometimes have to do "ignore all instructions above" or restart a new window to make it 100% clean.

True reasoning, in my opinion, should be able to derive useful insights from a small amount of data along with a deterministic confidence score. Reuse pattern from one to another, even across languages. This became especially clear when the project involved multiple programming languages.

This naïve take is obviously an understatement or maybe an insult to the entire ML field. It’s more about my personal feeling. Maybe someone will sponsor me to get a Master’s or PhD in ML so I can give you a better answer!

**AI:**

**1.** Whether you like it or not, I think GPT is insanely useful, especially for bootstrapping a new idea in a language you don’t know. Without GPT, I don’t believe I could have completed the project alone, or at least not in such a short amount of time. This blog wouldn’t even exist without it. At this point, calling it “completely useless” and refusing to use it is both arrogant and ignorant.

**2.** Rust is extremely challenging, and not even vibe coding could save me.  

**3.** Even though I vibe my way through more than 3,000 lines of Rust code, both valid and discarded, I still do not know how to write a single Rust `for` loop. Yes, a `for` loop. I also do not understand many of the most basic Rust concepts. During the vibe coding process, my head was filled with countless questions:

* When do I need to use `into()` and why do I need to use `unwrap()`?
* Why `#[derive()]`,  Why `&`,  Why `*`, Why is `!` used for macros, Why is `?` at the end of so many functions?
* What is the purpose of `Some()`, `*mut`, and `&mut`? When should I use `map_err()` When `Ok()`?
* Why does Rust not have a `return` statement?
* Should imports be inside or outside a function? How do I resolve import conflicts? Do these choices affect runtime or compile-time behavior?
* What is a `trait` in practice, and when should I use one?
* What does `as` do internally, especially compared with `as` in TypeScript?
* What are the implications of using `unsafe`?\`
* Why do I sometimes get compiler errors that my function is thread-unsafe? Why do I need a `Mutex`?\`
* Does using Rust for this project benefit me in any way?
* ... and so on.

The reason I list these basic questions is that even though I asked GPT for explanations, I found them hard to validate and digest. The problem was that I lacked 1st-hand experience.

I needed to use these Rust syntaxes/features to build something simple and to make mistakes along the way. I needed to understand what problems they solve, when they apply, and which specific issues they address. Without that direct experience, and heavily relying only on GPT’s 2nd-hand explanations, nothing stayed in my memory.

Back in school, I used to spend days or even weeks just trying to understand a single programming concept. I wrote plenty of terrible code: infinite loops/recursion, incorrect type conversions that corrupted data, slow O(n²) algorithms, careless pointer usage that caused memory leaks, and programs that completely froze my poor intel laptop. Many of these mistakes even happened when I was just trying to solve a simple task.

In hindsight, those 1st-hand experiences were valuable. They were practice in converting, processing, translating, and summarizing my theoretical ideas into working code from 0 to 1, with all the details — and the devil is usually in the details.

All those mistakes and struggles were not thrown into the void. They slowly added up, became imprinted in my mind, helped me understand why certain languages and systems were designed the way they are, and allowed me to reason through many new concepts I have encountered lately.

Those experiences also built up my engineering instinct, or **mental model**, which is one of the reasons I was able to come up with many of the Rust questions I listed earlier. That probably can help me truly understand the language itself.

GPT short-circuits that process, “steal” the 1st-hand experience we used to have to go through. Prompting is fast and easy, and humans tend to pick the easier path. It is hard to go back once you realize something that used to take weeks can now be done in a day. Even if the longer process might benefit you in the long run.

You fall into the “one more prompt” loop without noticing. It is addictive, like playing a Gacha machine and hoping GPT finally gives you that perfect SSR code.

While GPT is incredibly useful, it can also be useless for learning. It is like watching someone draw for you and then calling yourself an artist.

Calling this merely a skill issue is an understatement and oversimplifies the problem we face today.

AI is disruptive in a way that is completely different from the old Google Search or Stack Overflow debates. Even copying a Stack Overflow answer required "context recognition" and "context adaptation". GPT now handles all of that, reducing the need to fully understand a problem before producing a solution.

Even experienced developers can get stuck in endless prompting instead of fixing things manually. Some even argue that we should wait for the next model to solve the issue. Junior developers are especially vulnerable to this trap.

I am certainly pessimistic about the future of education and the prospects for junior. The market will not slow down. Employers will expect you to be faster and do more. GPT is easier, and competition pushes you toward using it. I see no reason not to let GPT involve daily work for me, but then you risk losing that 1st-hand experience. Juniors could easily become nothing more than brain-rot GPT wrappers if they aren't careful.

But without those juniors, where will our mid/senior-level developers come from?  
Will we face a great recession of software quality in the next 10 years?

I’ll end my blog here, with my questions still unanswered.

(By the way, English is not my native language, so this long post is GPT assisted. :P)

---

Here is an idea I had while writing this blog, for those who made it this far and are still interested. If you can come up with a system where:

1. Students are allowed to use AI.
2. It is extremely convenient and fast, and can be integrated easily into existing educational systems.
3. The AI is dedicated to educational resources and search, with strict prompt limitations. All results are precise, backed by credible links, and sometimes returned only as links with no AI summarization.
4. All these “limitations” exist so that a reward system can encourage students to go through the 1st-hand experience in a way that trains their awareness and skepticism.

I don't know which form it would be, but with such a system, maybe someone is able to disrupt the future of educational system and build a million-dollar startup.

