import { Plugin, WorkspaceWindow } from 'obsidian';
import { TikzjaxPluginSettings, DEFAULT_SETTINGS, TikzjaxSettingTab } from "./settings";
import { optimize } from "./svgo.browser";

// @ts-ignore
import tikzjaxJs from 'inline:./tikzjax.js';

export default class TikzjaxPlugin extends Plugin {
    settings: TikzjaxPluginSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new TikzjaxSettingTab(this.app, this));

        // Support pop-out windows
        this.app.workspace.onLayoutReady(() => {
            this.loadTikZJaxAllWindows();
            this.registerEvent(this.app.workspace.on("window-open", (win, window) => {
                this.loadTikZJax(window.document);
            }));
        });

        this.addSyntaxHighlighting();
        this.registerTikzCodeBlock();
    }

    onunload() {
        this.unloadTikZJaxAllWindows();
        this.removeSyntaxHighlighting();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    loadTikZJax(doc: Document) {
        const s = document.createElement("script");
        s.id = "tikzjax";
        s.type = "text/javascript";
        s.innerText = tikzjaxJs;
        doc.body.appendChild(s);

        doc.addEventListener('tikzjax-load-finished', this.postProcessSvg);
    }

    unloadTikZJax(doc: Document) {
        const s = doc.getElementById("tikzjax");
        s.remove();

        doc.removeEventListener("tikzjax-load-finished", this.postProcessSvg);
    }

    loadTikZJaxAllWindows() {
        for (const window of this.getAllWindows()) {
            this.loadTikZJax(window.document);
        }
    }

    unloadTikZJaxAllWindows() {
        for (const window of this.getAllWindows()) {
            this.unloadTikZJax(window.document);
        }
    }

    getAllWindows() {
        const windows = [];
        windows.push(this.app.workspace.rootSplit.win);

        // @ts-ignore floatingSplit is undocumented
        const floatingSplit = this.app.workspace.floatingSplit;
        floatingSplit.children.forEach((child: any) => {
            if (child instanceof WorkspaceWindow) {
                windows.push(child.win);
            }
        });

        return windows;
    }

    registerTikzCodeBlock() {
        this.registerMarkdownCodeBlockProcessor("tikz", (source, el, ctx) => {
            const container = el.createDiv("tikz-container");
            const tikzWrapper = container.createDiv("tikz-wrapper");
            tikzWrapper.addClass("custom-vertical-center");
            const paddingAmount = "15px"; // Adjust the padding as needed
            tikzWrapper.style.paddingTop = paddingAmount;
            tikzWrapper.style.paddingBottom = paddingAmount; // Add padding to the bottom
            const script = tikzWrapper.createEl("script");

            script.setAttribute("type", "text/tikz");
            script.setAttribute("data-show-console", "true");

            script.setText(this.tidyTikzSource(source));

            el.appendChild(container);
        });
    }

    addSyntaxHighlighting() {
        // @ts-ignore
        window.CodeMirror.modeInfo.push({name: "Tikz", mime: "text/x-latex", mode: "stex"});
    }

    removeSyntaxHighlighting() {
        // @ts-ignore
        window.CodeMirror.modeInfo = window.CodeMirror.modeInfo.filter(el => el.name != "Tikz");
    }

    tidyTikzSource(tikzSource: string) {
        const remove = "&nbsp;";
        tikzSource = tikzSource.replaceAll(remove, "");

        let lines = tikzSource.split("\n");
        lines = lines.map(line => line.trim());
        lines = lines.filter(line => line);

        return lines.join("\n");
    }

    colorSVGinDarkMode(svg: string) {
        svg = svg.replaceAll(/("#000"|"black")/g, `"currentColor"`)
            .replaceAll(/("#fff"|"white")/g, `"var(--background-primary)"`);

        return svg;
    }

    optimizeSVG(svg: string) {
        return optimize(svg, {plugins:
            [
                {
                    name: 'preset-default',
                    params: {
                        overrides: {
                            cleanupIDs: false
                        }
                    }
                }
            ]
        // @ts-ignore
        }).data;
    }

    postProcessSvg = (e: Event) => {
        const svgEl = e.target as HTMLElement;
        let svg = svgEl.outerHTML;

        if (this.settings.invertColorsInDarkMode) {
            svg = this.colorSVGinDarkMode(svg);
        }

        svg = this.optimizeSVG(svg);

        svgEl.outerHTML = svg;
    }
}
