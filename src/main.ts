import { App, Plugin, PluginSettingTab, Setting, Platform, Notice, TFile, Menu, FileSystemAdapter } from 'obsidian';

interface StarnotePdfImporterSettings {
	defaultImportFolder: string;
	autoOpenAfterImport: boolean;
	filenamePrefix: string;
	fileConflictBehavior: 'rename' | 'overwrite' | 'skip';
}

const DEFAULT_SETTINGS: StarnotePdfImporterSettings = {
	defaultImportFolder: '',
	autoOpenAfterImport: true,
	filenamePrefix: 'imported_',
	fileConflictBehavior: 'rename'
};

export default class StarnotePdfImporterPlugin extends Plugin {
	settings: StarnotePdfImporterSettings;
	private starnotePackageName = 'com.starnote.app';
	private starnoteActivityName = 'com.starnote.app.MainActivity';

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

		this.addSettingTab(new StarnotePdfImporterSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'pdf') {
					menu.addItem((item) => {
						item
							.setTitle('Send to Starnote for Editing')
							.setIcon('file-output')
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

	private openStarnoteApp() {
		if (!Platform.isAndroidApp) {
			new Notice('This feature only works on Android devices');
			return;
		}

		try {
			const intentUri = `android-app://${this.starnotePackageName}`;
			window.location.href = intentUri;
			new Notice('Opening Starnote app...');
		} catch (error) {
			new Notice('Failed to open Starnote app. Please make sure it is installed.');
			console.error('Starnote open error:', error);
		}
	}

	private sendPdfToStarnote(file: TFile) {
		if (!Platform.isAndroidApp) {
			new Notice('This feature only works on Android devices');
			return;
		}

		try {
			const adapter = this.app.vault.adapter;
			const path = file.path;
			
			const intentUri = `android-app://${this.starnotePackageName}/edit?path=${encodeURIComponent(path)}`;
			window.location.href = intentUri;
			new Notice(`Sending "${file.name}" to Starnote for editing...`);
		} catch (error) {
			new Notice('Failed to send PDF to Starnote');
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

	private async pickAndImportPdf() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.pdf,application/pdf';

		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (file) {
				await this.importPdfFile(file);
			}
		};

		input.click();
	}

	private async importPdfFile(file: File) {
		try {
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
			const baseName = file.name.replace('.pdf', '');
			const newFilename = `${this.settings.filenamePrefix}${baseName}_${timestamp}.pdf`;
			
			let targetPath = newFilename;
			if (this.settings.defaultImportFolder) {
				targetPath = `${this.settings.defaultImportFolder}/${newFilename}`;
			}

			targetPath = await this.resolveFileConflict(targetPath);

			const arrayBuffer = await file.arrayBuffer();
			const uint8Array = new Uint8Array(arrayBuffer);

			await this.app.vault.createBinary(targetPath, uint8Array);

			const importedFile = this.app.vault.getAbstractFileByPath(targetPath);
			
			if (importedFile instanceof TFile) {
				new Notice(`Successfully imported PDF: ${importedFile.name}`);
				
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
		
		const openBtn = actionContainer.createEl('button', { text: 'Open Starnote App' });
		openBtn.addEventListener('click', () => this.plugin.openStarnoteApp());
		
		const importBtn = actionContainer.createEl('button', { text: 'Import PDF File' });
		importBtn.addEventListener('click', () => this.plugin.pickAndImportPdf());

		containerEl.createEl('h3', { text: 'Usage Instructions' });
		
		const instructions = containerEl.createEl('div');
		instructions.innerHTML = `
			<h4>How to use:</h4>
			<ol>
				<li><strong>Open Starnote:</strong> Use the "Open Starnote App" command or click the button above</li>
				<li><strong>Edit PDF:</strong> Open or import a PDF in Starnote and make your edits</li>
				<li><strong>Export to Obsidian:</strong> Use Starnote's share/export feature and select Obsidian, or use the "Import PDF File" command in Obsidian</li>
				<li><strong>New Copy:</strong> The imported PDF will be saved as a new copy with a timestamp and prefix</li>
			</ol>
			<h4>Android Intent Setup:</h4>
			<p>To enable direct export from Starnote to Obsidian:</p>
			<ol>
				<li>Install both Starnote and Obsidian apps on your Android device</li>
				<li>Configure Starnote to use Obsidian as a share target for PDF exports</li>
				<li>The plugin will handle incoming PDFs and create new copies in your vault</li>
			</ol>
		`;
	}
}
