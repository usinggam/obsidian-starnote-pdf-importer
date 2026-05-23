import { App, Plugin, PluginSettingTab, Setting, Platform, Notice, TFile, Menu, FileSystemAdapter } from 'obsidian';

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
	filenamePrefix: 'imported_',
	fileConflictBehavior: 'rename',
	starnotePackageName: 'com.starnote.app',
	lastEditingFile: null,
	lastEditingFolder: null
};

export default class StarnotePdfImporterPlugin extends Plugin {
	settings: StarnotePdfImporterSettings;

	async onload() {
		await this.loadSettings();
		
		this.addCommand({
			id: 'open-starnote',
			name: 'Open Starnote App',
			callback: () => this.openStarnoteApp()
		});

		this.addCommand({
			id: 'import-pdf-from-starnote',
			name: 'Import PDF from Starnote',
			callback: () => this.importPdfFromStarnote()
		});

		this.addCommand({
			id: 'pick-and-import-pdf',
			name: 'Pick and Import PDF File',
			callback: () => this.pickAndImportPdf()
		});
		
		this.addCommand({
			id: 'edit-current-pdf-in-starnote',
			name: 'Edit Current PDF in Starnote',
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
			name: 'Re-import Edited PDF (after Starnote)',
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
							.setTitle('Edit in Starnote ✏️')
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
		new Notice(`Attempting to open Starnote (${packageName})...`);
		
		let attempts = 0;
		const maxAttempts = 4;
		
		const tryOpen = () => {
			try {
				switch (attempts) {
					case 0:
						window.location.href = `intent://#Intent;package=${packageName};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end`;
						break;
					case 1:
						window.location.href = `intent://#Intent;package=${packageName};scheme=app;end`;
						break;
					case 2:
						window.location.href = `intent://#Intent;package=${packageName};end`;
						break;
					case 3:
						window.location.href = `market://details?id=${packageName}`;
						break;
				}
				attempts++;
				
				if (attempts < maxAttempts) {
					setTimeout(tryOpen, 700);
				} else if (attempts === maxAttempts) {
					new Notice('Please open Starnote manually from your app drawer.');
				}
			} catch (error) {
				attempts++;
				if (attempts < maxAttempts) {
					setTimeout(tryOpen, 400);
				} else {
					new Notice('Could not open Starnote automatically.');
					console.error('Starnote open error:', error);
				}
			}
		};
		
		tryOpen();
	}

	private async sendPdfToStarnote(file: TFile) {
		if (!Platform.isAndroidApp) {
			new Notice('This feature only works on Android devices');
			return;
		}

		try {
			const packageName = this.settings.starnotePackageName;
			
			// 记住正在编辑的文件
			this.settings.lastEditingFile = file.path;
			this.settings.lastEditingFolder = file.parent?.path || '';
			await this.saveSettings();
			
			new Notice(`Opening "${file.name}" in Starnote ✏️...`);
			
			// 尝试多种方式打开
			let attempts = 0;
			const maxAttempts = 5;
			
			const tryOpen = () => {
				try {
					switch (attempts) {
						case 0:
							window.location.href = `intent://#Intent;package=${packageName};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end`;
							break;
						case 1:
							window.location.href = `intent://edit?path=${encodeURIComponent(file.name)}#Intent;package=${packageName};scheme=app;end`;
							break;
						case 2:
							window.location.href = `intent://#Intent;package=${packageName};scheme=app;end`;
							break;
						case 3:
							window.location.href = `intent://#Intent;package=${packageName};end`;
							break;
						case 4:
							window.location.href = `market://details?id=${packageName}`;
							break;
					}
					attempts++;
					
					if (attempts < maxAttempts) {
						setTimeout(tryOpen, 700);
					} else if (attempts === maxAttempts) {
						new Notice('Please open Starnote manually and import the PDF.');
					}
				} catch (error) {
					attempts++;
					if (attempts < maxAttempts) {
						setTimeout(tryOpen, 400);
					} else {
						new Notice('Could not open Starnote automatically.');
						console.error('Starnote open error:', error);
					}
				}
			};
			
			tryOpen();
		} catch (error) {
			new Notice('Could not send PDF to Starnote');
			console.error('Send to Starnote error:', error);
		}
	}

	private async importPdfFromStarnote() {
		if (!Platform.isAndroidApp) {
			new Notice('This feature only works on Android devices');
			return;
		}

		try {
			const intentUri = `obsidian://starnote-import`;
			window.location.href = intentUri;
			new Notice('Opening file picker to import PDF...');
		} catch (error) {
			new Notice('Failed to open file picker');
			console.error('Import error:', error);
		}
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
			
			// 如果是从编辑返回，优先保存到原来的位置
			if (forEditingReturn && this.settings.lastEditingFile) {
				const lastFile = this.app.vault.getAbstractFileByPath(this.settings.lastEditingFile);
				if (lastFile instanceof TFile) {
					// 在原文件同一位置创建副本
					const originalPath = lastFile.parent?.path || '';
					baseName = lastFile.name.replace('.pdf', '');
					newFilename = `${baseName}_edited_${timestamp}.pdf`;
					targetPath = originalPath ? `${originalPath}/${newFilename}` : newFilename;
					
					// 清除上次编辑记录
					this.settings.lastEditingFile = null;
					this.settings.lastEditingFolder = null;
					await this.saveSettings();
				} else {
					// 回退到默认位置
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
				const baseName = originalPath.replace('.pdf', '');
				return `${baseName}_copy_${timestamp}.pdf`;
			
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

	private async importFromExternalUri(uri: string) {
		try {
			const response = await fetch(uri);
			if (!response.ok) {
				throw new Error('Failed to fetch file');
			}

			const blob = await response.blob();
			const filename = this.extractFilenameFromUri(uri) || `imported_pdf_${Date.now()}.pdf`;
			
			const file = new File([blob], filename, { type: 'application/pdf' });
			await this.importPdfFile(file);
		} catch (error) {
			new Notice('Failed to import PDF from external source');
			console.error('External import error:', error);
		}
	}

	private extractFilenameFromUri(uri: string): string | null {
		try {
			const url = new URL(uri);
			const pathname = url.pathname;
			const parts = pathname.split('/');
			return parts[parts.length - 1] || null;
		} catch {
			return null;
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
		containerEl.createEl('h2', { text: 'Starnote PDF Importer Settings' });

		new Setting(containerEl)
			.setName('Starnote App Package Name')
			.setDesc('Package name of the Starnote app on your device')
			.addText(text => text
				.setPlaceholder('com.starnote.app')
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
				.setPlaceholder('imported_')
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
		
		const openBtn = actionContainer.createEl('button', { text: 'Open Starnote App' });
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

		containerEl.createEl('h3', { text: '使用说明 (How to Use)' });
		
		const instructions = containerEl.createEl('div');
		instructions.innerHTML = `
			<div style="background: var(--background-secondary); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
				<h4 style="margin-top: 0;">📝 完整工作流 (Complete Workflow):</h4>
				<ol style="margin: 8px 0; padding-left: 20px;">
					<li>在 Obsidian 中找到要编辑的 PDF 文件</li>
					<li>右键点击 → 选择 <strong>"Edit in Starnote ✏️"</strong></li>
					<li>Starnote 打开后，在里面打开并编辑你的 PDF</li>
					<li>编辑完成后，保存或导出 PDF</li>
					<li>回到 Obsidian，点击 <strong>"🔄 Re-import Edited PDF"</strong></li>
					<li>选择 Starnote 导出的 PDF 文件</li>
					<li>✅ 编辑后的副本会保存到原文件同一位置！</li>
				</ol>
			</div>
			
			<div style="background: var(--background-secondary); padding: 16px; border-radius: 8px;">
				<h4 style="margin-top: 0;">🔍 查找 StarNote 包名 (Find StarNote Package):</h4>
				<p style="margin: 8px 0;">如果不能自动打开 StarNote 笔记，请先尝试以下常见包名（复制到上面的设置中）：</p>
				<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; margin: 12px 0;">
					<button id="try1" style="padding: 8px 12px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); cursor: pointer;">com.starnote.app</button>
					<button id="try2" style="padding: 8px 12px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); cursor: pointer;">com.xiaomiyoupin.starnote</button>
					<button id="try3" style="padding: 8px 12px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); cursor: pointer;">com.starnote.editor</button>
					<button id="try4" style="padding: 8px 12px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); cursor: pointer;">com.starnote.notes</button>
					<button id="try5" style="padding: 8px 12px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); cursor: pointer;">com.starnote.notepad</button>
					<button id="try6" style="padding: 8px 12px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); cursor: pointer;">cn.starnote.app</button>
				</div>
				<p style="margin-top: 12px;"><strong>如果上面都不行，请手动查找 (Manual Lookup):</strong></p>
				<ol style="margin: 8px 0; padding-left: 20px;">
					<li>下载一个应用检查工具（如 "App Inspector" 或 "Package Name Viewer"）</li>
					<li>打开它，在应用列表中找到 "StarNote 笔记"</li>
					<li>复制它的包名（格式：com.xxx.xxx）</li>
					<li>粘贴到上面的 "Starnote App Package Name" 设置中</li>
				</ol>
			</div>
		`;
		
		// Add click handlers to the package name buttons
		const packageButtons = ['try1', 'try2', 'try3', 'try4', 'try5', 'try6'];
		const packageNames = ['com.starnote.app', 'com.xiaomiyoupin.starnote', 'com.starnote.editor', 
		                     'com.starnote.notes', 'com.starnote.notepad', 'cn.starnote.app'];
		
		packageButtons.forEach((id, index) => {
			const btn = document.getElementById(id);
			if (btn) {
				btn.addEventListener('click', async () => {
					this.plugin.settings.starnotePackageName = packageNames[index];
					await this.plugin.saveSettings();
					this.display(); // Refresh to show the new value
					new Notice(`Set package to: ${packageNames[index]}`);
				});
			}
		});
	}
}
