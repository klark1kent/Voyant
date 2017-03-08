// assuming Bubblelines library is loaded by containing page (via voyant.jsp)
Ext.define('Voyant.panel.Bubblelines', {
	extend: 'Ext.panel.Panel',
	mixins: ['Voyant.panel.Panel'],
	alias: 'widget.bubblelines',
    statics: {
    	i18n: {
    	},
    	api: {
    		/**
    		 * @property bins How many "bins" to separate a document into.
    		 * @type Integer
    		 * @private
    		 */
    		bins: 50,
        	/**
        	 * @property query A string to search for in a document.
        	 * @type String
    		 * @private
        	 */
    		query: null,
    		
    		/**
    		 * @property stopList The stop list to use to filter results.
    		 * Choose from a pre-defined list, or enter a comma separated list of words, or enter an URL to a list of stop words in plain text (one per line).
    		 * @type String
    		 * @private
    		 */
    		stopList: 'auto',
    		/**
    		 * @property docId The document ID to restrict results to.
    		 * @type String
    		 * @private
    		 */
    		docId: undefined,
    		/**
    		 * @property docIndex The document index to restrict results to.
    		 * @type Integer
    		 * @private
    		 */
    		docIndex: undefined,
    		/**
    		 * @property maxDocs The maximum number of documents to show.
    		 * @type Integer
    		 * @private
    		 */
    		maxDocs: 50
    	},
    	glyph: 'xf06e@FontAwesome'
	},
	config: {
		bubblelines: undefined,
		termStore: undefined,
		docTermStore: undefined,
		docStore: undefined,
		selectedDocs: undefined,
		processedDocs: undefined,
    	options: [{xtype: 'stoplistoption'},{xtype: 'colorpaletteoption'}]
	},
	
	termTpl: new Ext.XTemplate(
		'<tpl for=".">',
			'<div class="term" style="color: rgb({color});float: left;padding: 3px;margin: 2px;">{term}</div>',
		'</tpl>'
	),
    
    constructor: function() {
        this.callParent(arguments);
    	this.mixins['Voyant.panel.Panel'].constructor.apply(this, arguments);
    	
    	this.on('loadedCorpus', function(src, corpus) {
    		this.getDocStore().getProxy().setExtraParam('corpus', corpus.getId());
    		if (this.isVisible()) {
        		this.getDocStore().load();
    		}
    		this.getDocTermStore().getProxy().setExtraParam('corpus', corpus.getId());
    	}, this);
    	
        this.on('activate', function() { // load after tab activate (if we're in a tab panel)
			if (this.getCorpus()) {				
				Ext.Function.defer(function() {this.getDocStore().load()}, 100, this);
			}
    	}, this);
        
        this.on('query', function(src, query) {
    		if (query !== undefined && query != '') {
    			this.getDocTermsFromQuery(query);
    		}
    	}, this);
        
        this.on('documentsSelected', function(src, docIds) {
        	this.setApiParam('docId', docIds);
        	this.getBubblelines().cache.each(function(d) {
        		d.hidden = docIds.indexOf(d.id) === -1;
        	});
        	this.getBubblelines().drawGraph();
        }, this);
    	
    	this.on('termsClicked', function(src, terms) {
    		if (src !== this) {
	    		var queryTerms = [];
	    		terms.forEach(function(term) {
        			if (Ext.isString(term)) {queryTerms.push(term);}
        			else if (term.term) {queryTerms.push(term.term);}
        			else if (term.getTerm) {queryTerms.push(term.getTerm());}
        		});
	    		this.getDocTermsFromQuery(queryTerms);
    		}
		}, this);
    	
    	this.on('documentTermsClicked', function(src, terms) {
    		var queryTerms = [];
    		terms.forEach(function(term) {
    			if (term.getTerm()) {queryTerms.push(term.getTerm());}
    		});
    		this.getDocTermsFromQuery(queryTerms);
    	}, this);
    	
    	this.down('#granularity').setValue(parseInt(this.getApiParam('bins')));
    },
    
    initComponent: function() {
    	this.setTermStore(Ext.create('Ext.data.ArrayStore', {
            fields: ['term', 'color'],
            listeners: {
            	load: function(store, records, successful, options) {
            		var termsView = this.down('#termsView');
            		for (var i = 0; i < records.length; i++) {
            			var r = records[i];
            			termsView.select(r, true);
            		}
            	},
            	scope: this
            }
        }));
    	
    	this.setDocStore(Ext.create("Ext.data.Store", {
			model: "Voyant.data.model.Document",
    		autoLoad: false,
    		remoteSort: false,
    		proxy: {
				type: 'ajax',
				url: Voyant.application.getTromboneUrl(),
				extraParams: {
					tool: 'corpus.DocumentsMetadata'
				},
				reader: {
					type: 'json',
					rootProperty: 'documentsMetadata.documents',
					totalProperty: 'documentsMetadata.total'
				},
				simpleSortMode: true
   		     },
   		     listeners: {
   		    	load: function(store, records, successful, options) {
   					this.processDocuments(records);
   					this.getProcessedDocs().each(function(doc) {
   						this.getBubblelines().addDocToCache(doc);
   					}, this);
   					// get the top 5 corpus terms
   					this.loadFromCorpusTerms(this.getCorpus().getCorpusTerms({autoload: false}));
   				},
   				scope: this
   		     }
    	}));
    	
    	this.setDocTermStore(Ext.create("Ext.data.Store", {
			model: "Voyant.data.model.DocumentTerm",
			asynchronousLoad: false,
    		autoLoad: false,
    		remoteSort: false,
    		proxy: {
				type: 'ajax',
				url: Voyant.application.getTromboneUrl(),
				extraParams: {
					tool: 'corpus.DocumentTerms',
					withDistributions: 'raw',
					withPositions: true
				},
				reader: {
					type: 'json',
		            rootProperty: 'documentTerms.terms',
		            totalProperty: 'documentTerms.total'
				},
				simpleSortMode: true
   		     },
   		     listeners: {
   		    	 load: function(store, records, successful, options) {
   		    		records.forEach(function(record) {
   		    			var termData = this.processTerms(record);
   		    			var docId = record.get('docId');
   		    			var term = record.get('term');
   		    			var termObj = {};
   		    			termObj[term] = termData;
   		    			this.getBubblelines().addTermsToDoc(termObj, docId);
   		    		}, this);
   		    		this.getBubblelines().doBubblelinesLayout();

//   					this.processDocuments();
//   					if (this.maxFreqChanged) {
//   						this.calculateBubbleRadii();
//   					} else {
//   						this.calculateBubbleRadii(options.params.type);
//   					}
//   					this.getBubblelines().setCanvasHeight();
//   					this.getBubblelines().drawGraph();
   				},
   				scope: this
   		     }
    	}));
    	
    	this.setProcessedDocs(new Ext.util.MixedCollection());
    	
    	Ext.apply(this, {
    		title: this.localize('title'),
    		dockedItems: [{
                dock: 'bottom',
                xtype: 'toolbar',
                enableOverflow: true,
                items: [{
                	xtype: 'querysearchfield'
                },{
	            	text: this.localize('clearTerms'),
					glyph: 'xf014@FontAwesome',
	            	handler: function() {
	            		this.down('#termsView').getSelectionModel().deselectAll(true);
	            		this.getTermStore().removeAll();
	            		this.setApiParams({query: null});
	            		this.getBubblelines().removeAllTerms();
	            		this.getBubblelines().drawGraph();
	            	},
	            	scope: this                			
        		},{
	            	xtype: 'documentselectorbutton'
        		},{
	            	xtype: 'slider',
	            	itemId: 'granularity',
	            	fieldLabel: this.localize('granularity'),
	            	labelAlign: 'right',
	            	labelWidth: 70,
	            	width: 150,
	            	increment: 10,
	            	minValue: 10,
	            	maxValue: 300,
	            	listeners: {
	            		changecomplete: function(slider, newvalue) {
	            			this.setApiParams({bins: newvalue});
	            			this.getBubblelines().bubbleSpacing = newvalue;
	            			this.reloadTermsData();
	            		},
	            		scope: this
	            	}
	            },{
	            	xtype: 'checkbox',
	            	boxLabel: this.localize('separateLines'),
	            	boxLabelAlign: 'before',
	            	checked: false,
	            	handler: function(checkbox, checked) {
	            		this.getBubblelines().SEPARATE_LINES_FOR_TERMS = checked;
	            		this.getBubblelines().lastClickedBubbles = {};
	            		this.getBubblelines().setCanvasHeight();
	    				this.getBubblelines().drawGraph();
	            	},
	            	scope: this
	            	
	            }]
    		}],
            border: false,
            layout: 'fit',
            items: {
            	layout: {
            		type: 'vbox',
            		align: 'stretch'
            	},
            	defaults: {border: false},
	            items: [{
	            	height: 30,
	            	itemId: 'termsView',
	            	xtype: 'dataview',
	            	store: this.getTermStore(),
	            	tpl: this.termTpl,
	            	itemSelector: 'div.term',
	            	overItemCls: 'over',
	            	selectedItemCls: 'selected',
	            	selectionModel: {
	            		mode: 'SIMPLE'
	            	},
//	            	cls: 'selected', // default selected
	            	focusCls: '',
	            	listeners: {
	            		beforeitemclick: function(dv, record, item, index, event, opts) {
	            			event.preventDefault();
	            			event.stopPropagation();
	            			dv.fireEvent('itemcontextmenu', dv, record, item, index, event, opts);
	            			return false;
	            		},
	            		beforecontainerclick: function() {
	            			// cancel deselect all
	            			event.preventDefault();
	            			event.stopPropagation();
	            			return false;
	            		},
	            		selectionchange: function(selModel, selections) {
	            			var dv = this.down('#termsView');
	            			var terms = [];
	            			
	            			dv.getStore().each(function(r) {
	            				if (selections.indexOf(r) !== -1) {
	            					terms.push(r.get('term'));
	            					Ext.fly(dv.getNodeByRecord(r)).removeCls('unselected').addCls('selected');
	            				} else {
	            					Ext.fly(dv.getNodeByRecord(r)).removeCls('selected').addCls('unselected');
	            				}
	            			});
	            			
	            			for (var index in this.getBubblelines().lastClickedBubbles) {
	            				var lcTerms = this.getBubblelines().lastClickedBubbles[index];
	            				for (var term in lcTerms) {
	            					if (terms.indexOf(term) == -1) {
	            						delete this.getBubblelines().lastClickedBubbles[index][term];
	            					}
	            				}
	            				
	            			}
	            			this.getBubblelines().termsFilter = terms;
	            			this.getBubblelines().setCanvasHeight();
	            			this.getBubblelines().drawGraph();
	            		},
	            		itemcontextmenu: function(dv, record, el, index, event) {
	            			event.preventDefault();
	            			event.stopPropagation();
	            			var isSelected = dv.isSelected(el);
	            			var menu = new Ext.menu.Menu({
	            				floating: true,
	            				items: [{
	            					text: isSelected ? this.localize('hideTerm') : this.localize('showTerm'),
	            					handler: function() {
	            						if (isSelected) {
	            							dv.deselect(index);
	            						} else {
	            							dv.select(index, true);
	            						}
	            					},
	            					scope: this
	            				},{
	            					text: this.localize('removeTerm'),
	            					handler: function() {
	            						dv.deselect(index);
	            						var term = this.getTermStore().getAt(index).get('term');
	            						this.getTermStore().removeAt(index);
	            						dv.refresh();
	            						
	            						this.getBubblelines().removeTerm(term);
	            						this.getBubblelines().setCanvasHeight();
	            						this.getBubblelines().drawGraph();
	            					},
	            					scope: this
	            				}]
	            			});
	            			menu.showAt(event.getXY());
	            		},
	            		scope: this
	            	}
	            },{
	            	flex: 1,
	            	xtype: 'container',
	            	autoEl: 'div',
	            	itemId: 'canvasParent',
	            	layout: 'fit',
	            	overflowY: 'auto',
	            	overflowX: 'hidden'
	            }],
	            listeners: {
	            	render: function(component) {
	            		var canvasParent = this.down('#canvasParent');
	                	this.setBubblelines(new Bubblelines({
	                		container: canvasParent,
	                		clickHandler: this.bubbleClickHandler.bind(this)
	                	}));
	                	this.getBubblelines().bubbleSpacing = parseInt(this.getApiParam('bins'));
	            	},
            		afterlayout: function(container) {
            			if (this.getBubblelines().initialized === false) {
            				this.getBubblelines().initializeCanvas();
            			}
            		},
	        		resize: function(cnt, width, height) {
	        			this.getBubblelines().doBubblelinesLayout();
	        		},
            		scope: this
            	}
            }
		});
    	
    	this.callParent(arguments);
    },
    
    loadFromCorpusTerms: function(corpusTerms) {
    	if (this.getBubblelines()) { // get rid of existing terms
    		this.getBubblelines().removeAllTerms();
    		this.getTermStore().removeAll(true);
    	}
		corpusTerms.load({
		    callback: function(records, operation, success) {
		    	var query = []; //this.getApiParam('query') || [];
				if (typeof query == 'string') query = [query];
		    	records.forEach(function(record, index) {
					query.push(record.get('term'));
				}, this);
		    	this.getDocTermsFromQuery(query);
		    },
		    scope: this,
		    params: {
		    	limit: this.getApiParam("query") ? undefined : 5,
		    	stopList: this.getApiParams('stopList'),
		    	query: this.getApiParam("query")
		    }
    	});
    },
    
    /**
     * Get the results for the query(s) for each of the corpus documents.
     * @param query {String|Array}
     */
    getDocTermsFromQuery: function(query) {
    	if (query) {this.setApiParam("query", query);} // make sure it's set for subsequent calls
    	var corpus = this.getCorpus();
    	if (corpus && this.isVisible()) {
        	var docs = this.getCorpus().getDocuments();
        	var len = docs.getCount();
//        	var maxDocs = parseInt(this.getApiParam('maxDocs'))
//        	if (len > maxDocs) {len = maxDocs}
        	for (var i = 0; i < len; i++) {
        		var doc = docs.getAt(i);
    	    	this.setApiParams({query: query, docIndex: undefined, docId: doc.getId()});
    			this.getDocTermStore().load({params: this.getApiParams()});
        	}
    	}
	},
    
	reloadTermsData: function() {
		var terms = [];
		for (var term in this.getBubblelines().currentTerms) {
			terms.push(term);
		}
		this.getDocTermsFromQuery(terms);
	},
	
    filterDocuments: function() {
		var docIds = this.getApiParam('docId');
		if (docIds == '') {
			docIds = [];
			this.getCorpus().getDocuments().each(function(item, index) {
				docIds.push(item.getId());
			});
			this.setApiParams({docId: docIds});
		}
		if (typeof docIds == 'string') docIds = [docIds];
		
		if (docIds == null) {
			this.setSelectedDocs(this.getCorpus().getDocuments().clone());
			var count = this.getSelectedDocs().getCount();
			if (count > 10) {
				for (var i = 10; i < count; i++) {
					this.getSelectedDocs().removeAt(10);
				}
			}
			docIds = [];
			this.getSelectedDocs().eachKey(function(docId, doc) {
				docIds.push(docId);
			}, this);
			this.setApiParams({docId: docIds});
		} else {
			this.setSelectedDocs(this.getCorpus().getDocuments().filterBy(function(doc, docId) {
				return docIds.indexOf(docId) != -1;
			}, this));
		}
	},
	
	processDocuments: function(docs) {
		docs.forEach(this.processDocument, this);
	},
	
	// produce format that bubblelines can use
	processDocument: function(doc) {
		var docId = doc.getId();
		if (!this.getProcessedDocs().containsKey(docId)) {
			var title = doc.getShortTitle();
			title = title.replace('&hellip;', '...');
			var index = doc.get('index');
			var totalTokens = doc.get('tokensCount-lexical');
		
			this.getProcessedDocs().add(docId, {
				id: docId,
				index: index,
				title: title,
				totalTokens: totalTokens,
				terms: {}
			});
		}
	},
	
	processTerms: function(termRecord) {
		var termObj;
		var term = termRecord.get('term');
		var rawFreq = termRecord.get('rawFreq');
		var positions = termRecord.get('positions');
		if (rawFreq > 0) {
			var color = this.getApplication().getColorForTerm(term);
			if (this.getTermStore().find('term', term) === -1) {
				this.getTermStore().loadData([[term, color]], true);
				var index = this.getTermStore().find('term', term);
				this.down('#termsView').select(index, true); // manually select since the store's load listener isn't triggered
			}
			var distributions = termRecord.get('distributions');
			termObj = {positions: positions, distributions: distributions, rawFreq: rawFreq, color: color};
		} else {
			termObj = false;
		}
		
		return termObj;
	},
	
	bubbleClickHandler: function(data) {
		this.getApplication().dispatchEvent('termsClicked', this, data);
	}
});