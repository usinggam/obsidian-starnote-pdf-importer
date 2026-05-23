import { App, Plugin, PluginSettingTab, Setting, Platform, Notice, TFile, Menu } from 'obsidian';

interface StarnotePdfImporterSettings {
	defaultImportFolder: string;
	autoOpenAfterImport: boolean;
	filenamePrefix: string;
	fileConflictBehavior: 'rename' | 'overwrite' | 'skip';
	starnotePackageName: string;
	lastEditingFile: string | null;
	lastEditingFolder: string | null;
}

const DEFAULT_SETTINGS: StarnotePdfImporterSettings = {
	defaultImportFolder: '',
	autoOpenAfterImport: true,
	filenamePrefix: 'edited_',
	fileConflictBehavior: 'rename',
	starnotePackageName: 'com.onyx.galaxy.note',
	lastEditingFile: null,
	lastEditingFolder: null
};

export default class StarnotePdfImporterPlugin extends Plugin {
	settings: StarnotePdfImporterSettings;

	async onload() {
		await this.loadSettings();
		
		this.addCommand({
			id: 'open-starnote',
			name: 'Open StarNote App',
			callback: () => this.openStarnoteApp()
		});

		this.addCommand({
			id: 'import-pdf-from-starnote',
			name: 'Import PDF from StarNote',
			callback: () => this.importPdfFromStarnote()
		});

		this.addCommand({
			id: 'pick-and-import-pdf',
			name: 'Pick and Import PDF File',
			callback: () => this.pickAndImportPdf()
		});
		
		this.addCommand({
			id: 'edit-current-pdf-in-starnote',
			name: 'Edit Current PDF in StarNote',
			checkCallback: (checking) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (checking) {
					return activeFile && activeFile.extension === 'pdf';
				}
				if (activeFile && activeFile.extension === 'pdf') {
					this.sendPdfToStarnote(activeFile);
				}
			}
		});
		
		this.addCommand({
			id: 'reimport-edited-pdf',
			name: 'Re-import Edited PDF (after StarNote)',
			checkCallback: (checking) => {
				if (checking) {
					return true;
				}
				this.pickAndImportPdf(true);
			}
		});

		this.addSettingTab(new StarnotePdfImporterSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'pdf') {
					menu.addItem((item) => {
						item
							.setTitle('Edit in StarNote ✏️')
							.setIcon('pencil')
							.onClick(() => this.sendPdfToStarnote(file));
					});
				}
			})
		);

		if (Platform.isAndroidApp) {
			this.setupAndroidIntentHandler();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	public openStarnoteApp() {
		if (!Platform.isAndroidApp) {
			new Notice('This feature only works on Android devices');
			return;
		}

		const packageName = this.settings.starnotePackageName;
		new Notice('Opening StarNote...');
		
		try {
			window.location.href = `intent://#Intent;package=${packageName};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end`;
		} catch (error) {
			new Notice('Please open StarNote manually from your app drawer');
			console.error('StarNote open error:', error);
		}
	}

	private async sendPdfToStarnote(file: TFile) {
		if (!Platform.isAndroidApp) {
			new Notice('This feature only works on Android devices');
			return;
		}

		try {
			const packageName = this.settings.starnotePackageName;
			
			this.settings.lastEditingFile = file.path;
			this.settings.lastEditingFolder = file.parent?.path || '';
			await this.saveSettings();
			
			// 尝试多种 Intent 方式打开 StarNote 并提示用户可以手动在 StarNote 中导入
			new Notice(`Opening StarNote...`);
			
			// 先尝试用简单方式打开，然后给用户说明
			let opened = false;
			
			try {
				// 方法1: 直接打开应用
				window.location.href = `intent://#Intent;package=${packageName};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end`;
				opened = true;
			} catch (e) {
				console.log('Method 1 failed');
			}
			
			// 无论如何，给用户明确的提示
			setTimeout(() => {
				new Notice(`StarNote opened! Now manually import: "${file.name}" into StarNote to edit.`, 5000);
			}, 800);
			
			if (!opened) {
				new Notice('Please open StarNote manually from your app drawer');
			}
			
		} catch (error) {
			new Notice('Please open StarNote manually from your app drawer');
			console.error('StarNote open error:', error);
		}
	}

	private async importPdfFromStarnote() {
		if (!Platform.isAndroidApp) {
			new Notice('This feature only works on Android devices');
			return;
		}
		
		new Notice('Opening file picker to import PDF...');
		this.pickAndImportPdf();
	}

	public async pickAndImportPdf(forEditingReturn: boolean = false) {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.pdf,application/pdf';

		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (file) {
				await this.importPdfFile(file, forEditingReturn);
			}
		};

		input.click();
	}

	private async importPdfFile(file: File, forEditingReturn: boolean = false) {
		try {
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
			
			let baseName = file.name.replace('.pdf', '');
			let newFilename = `${this.settings.filenamePrefix}${baseName}_${timestamp}.pdf`;
			
			let targetPath = newFilename;
			
			if (forEditingReturn && this.settings.lastEditingFile) {
				const lastFile = this.app.vault.getAbstractFileByPath(this.settings.lastEditingFile);
				if (lastFile instanceof TFile) {
					const originalPath = lastFile.parent?.path || '';
					baseName = lastFile.name.replace('.pdf', '');
					newFilename = `${baseName}_edited_${timestamp}.pdf`;
					targetPath = originalPath ? `${originalPath}/${newFilename}` : newFilename;
					
					this.settings.lastEditingFile = null;
					this.settings.lastEditingFolder = null;
					await this.saveSettings();
				} else {
					if (this.settings.defaultImportFolder) {
						targetPath = `${this.settings.defaultImportFolder}/${newFilename}`;
					}
				}
			} else if (this.settings.defaultImportFolder) {
				targetPath = `${this.settings.defaultImportFolder}/${newFilename}`;
			}

			targetPath = await this.resolveFileConflict(targetPath);

			const arrayBuffer = await file.arrayBuffer();

			await this.app.vault.createBinary(targetPath, arrayBuffer);

			const importedFile = this.app.vault.getAbstractFileByPath(targetPath);
			
			if (importedFile instanceof TFile) {
				const message = forEditingReturn 
					? `✓ Edited PDF saved: ${importedFile.name}` 
					: `✓ PDF imported: ${importedFile.name}`;
				new Notice(message);
				
				if (this.settings.autoOpenAfterImport) {
					await this.app.workspace.getLeaf(false).openFile(importedFile);
				}
			}
		} catch (error) {
			new Notice('Failed to import PDF file');
			console.error('Import PDF error:', error);
		}
	}

	private async resolveFileConflict(originalPath: string): Promise<string> {
		const existingFile = this.app.vault.getAbstractFileByPath(originalPath);
		
		if (!existingFile) {
			return originalPath;
		}

		switch (this.settings.fileConflictBehavior) {
			case 'overwrite':
				await this.app.vault.delete(existingFile);
				return originalPath;
			case 'skip':
				const timestamp = Date.now();
				const baseNameSkip = originalPath.replace('.pdf', '');
				return `${baseNameSkip}_copy_${timestamp}.pdf`;
			case 'rename':
			default:
				let counter = 1;
				let newPath = originalPath;
				while (this.app.vault.getAbstractFileByPath(newPath)) {
					const baseName = originalPath.replace('.pdf', '');
					newPath = `${baseName}_${counter}.pdf`;
					counter++;
				}
				return newPath;
		}
	}

	private setupAndroidIntentHandler() {
		this.registerObsidianProtocolHandler('starnote-import', async () => {
			await this.pickAndImportPdf();
		});

		this.registerObsidianProtocolHandler('starnote-edit-complete', async (params) => {
			if (params?.path) {
				const filePath = decodeURIComponent(params.path);
				const file = this.app.vault.getAbstractFileByPath(filePath);
				
				if (file instanceof TFile) {
					const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
					const baseName = file.name.replace('.pdf', '');
					const newPath = `${this.settings.defaultImportFolder}/${this.settings.filenamePrefix}${baseName}_edited_${timestamp}.pdf`;
					
					try {
						const content = await this.app.vault.readBinary(file);
						await this.app.vault.createBinary(newPath, content);
						
						const newFile = this.app.vault.getAbstractFileByPath(newPath);
						if (newFile instanceof TFile) {
							new Notice(`Created edited copy: ${newFile.name}`);
							if (this.settings.autoOpenAfterImport) {
								await this.app.workspace.getLeaf(false).openFile(newFile);
							}
						}
					} catch (error) {
						new Notice('Failed to create edited PDF copy');
						console.error('Edit complete error:', error);
					}
				}
			}
		});
	}
}

class StarnotePdfImporterSettingTab extends PluginSettingTab {
	plugin: StarnotePdfImporterPlugin;

	constructor(app: App, plugin: StarnotePdfImporterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'StarNote PDF Importer Pro' });

		new Setting(containerEl)
			.setName('StarNote App Package Name')
			.setDesc('Package name of StarNote notes app on your device')
			.addText(text => text
				.setPlaceholder('com.onyx.galaxy.note')
				.setValue(this.plugin.settings.starnotePackageName)
				.onChange(async (value) => {
					this.plugin.settings.starnotePackageName = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Import Folder')
			.setDesc('Folder path where imported PDFs will be saved (leave empty for vault root)')
			.addText(text => text
				.setPlaceholder('e.g., Imported PDFs')
				.setValue(this.plugin.settings.defaultImportFolder)
				.onChange(async (value) => {
					this.plugin.settings.defaultImportFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Filename Prefix')
			.setDesc('Prefix added to imported PDF filenames')
			.addText(text => text
				.setPlaceholder('edited_')
				.setValue(this.plugin.settings.filenamePrefix)
				.onChange(async (value) => {
					this.plugin.settings.filenamePrefix = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-open after import')
			.setDesc('Automatically open imported PDF file')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoOpenAfterImport)
				.onChange(async (value) => {
					this.plugin.settings.autoOpenAfterImport = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('File Conflict Behavior')
			.setDesc('What to do when a file with the same name already exists')
			.addDropdown(dropdown => dropdown
				.addOption('rename', 'Rename (add number suffix)')
				.addOption('overwrite', 'Overwrite existing file')
				.addOption('skip', 'Skip (add copy suffix)')
				.setValue(this.plugin.settings.fileConflictBehavior)
				.onChange(async (value: 'rename' | 'overwrite' | 'skip') => {
					this.plugin.settings.fileConflictBehavior = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', { text: 'Quick Actions' });
		
		const actionContainer = containerEl.createDiv('action-buttons');
		actionContainer.style.display = 'flex';
		actionContainer.style.gap = '12px';
		actionContainer.style.flexWrap = 'wrap';
		
		const openBtn = actionContainer.createEl('button', { text: 'Open StarNote App' });
		openBtn.style.padding = '10px 16px';
		openBtn.style.borderRadius = '8px';
		openBtn.style.backgroundColor = 'var(--interactive-accent)';
		openBtn.style.color = 'white';
		openBtn.style.border = 'none';
		openBtn.style.cursor = 'pointer';
		openBtn.addEventListener('click', () => this.plugin.openStarnoteApp());
		
		const importBtn = actionContainer.createEl('button', { text: 'Import PDF File' });
		importBtn.style.padding = '10px 16px';
		importBtn.style.borderRadius = '8px';
		importBtn.style.backgroundColor = 'var(--interactive-accent)';
		importBtn.style.color = 'white';
		importBtn.style.border = 'none';
		importBtn.style.cursor = 'pointer';
		importBtn.addEventListener('click', () => this.plugin.pickAndImportPdf());
		
		const reimportBtn = actionContainer.createEl('button', { text: '🔄 Re-import Edited PDF' });
		reimportBtn.style.padding = '10px 16px';
		reimportBtn.style.borderRadius = '8px';
		reimportBtn.style.backgroundColor = 'var(--interactive-normal)';
		reimportBtn.style.color = 'var(--text-normal)';
		reimportBtn.style.border = '1px solid var(--background-modifier-border)';
		reimportBtn.style.cursor = 'pointer';
		reimportBtn.addEventListener('click', () => this.plugin.pickAndImportPdf(true));

		containerEl.createEl('h3', { text: '使用说明 (Why manual import/export?)' });
		
		const instructions = containerEl.createEl('div');
		instructions.innerHTML = `
			<div style="background: var(--background-secondary); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
				<h4 style="margin-top: 0;">🤔 为什么需要手动导入/导出？</h4>
				<p style="margin: 8px 0;">由于 Android 系统和 StarNote 应用的限制：</p>
				<ul style="margin: 8px 0; padding-left: 20px;">
					<li>StarNote 没有公开的 API 来接收 PDF</li>
					<li>没有直接的 Intent 方式自动发送文件到 StarNote</li>
					<li>每个应用的文件是沙盒隔离的</li>
				</ul>
			</div>
			
			<div style="background: var(--background-secondary); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
				<h4 style="margin-top: 0;">📝 完整工作流 (Complete Workflow):</h4>
				<ol style="margin: 8px 0; padding-left: 20px;">
					<li>在 Obsidian 找到要编辑的 PDF</li>
					<li>右键点击 → 选择 <strong>"Edit in StarNote ✏️"</strong></li>
					<li>StarNote 会直接打开</li>
					<li><strong>在 StarNote 中手动打开/导入 PDF</strong> 并编辑</li>
					<li>编辑完成后，保存/导出 PDF</li>
					<li>回到 Obsidian，点击 <strong>"🔄 Re-import Edited PDF"</strong></li>
					<li>选择 StarNote 导出的 PDF 文件</li>
					<li>✅ 编辑后的副本会保存到原文件同一位置！</li>
				</ol>
			</div>
			
			<div style="background: var(--background-secondary); padding: 16px; border-radius: 8px;">
				<h4 style="margin-top: 0;">💡 插件的价值</h4>
				<p style="margin: 8px 0;">这个插件让流程更简单：</p>
				<ul style="margin: 8px 0; padding-left: 20px;">
					<li>一键打开 StarNote，不用去桌面找</li>
					<li>记住你正在编辑的文件</li>
					<li>智能重新导入到同一位置</li>
					<li>自动创建时间戳备份，不覆盖原文件</li>
				</ul>
			</div>
		`;
	}
}
