<script>
import * as mutations from '../store/mutation-types';
import MaketextMixin from './MaketextMixin.vue';

/* global moment */
export default {
    props: ['config'],
    mixins: [MaketextMixin],
    computed: {
        task() {
            return this.$store.state.taskGrid.panelState.taskToShow;
        },
        grid() {
            return this.$store.state.taskGrid.panelState.correspondingGrid;
        },
        isActive() {
            return this.$store.state.taskGrid.panelState.active;
        },
        isEditMode() {
          return this.$store.state.taskGrid.panelState.isEditMode;
        },
        isNewTaskEditMode() {
          return this.$store.state.taskGrid.panelState.isNewTaskEditMode;
        },
        isLoading() {
          return this.$store.state.taskGrid.panelState.isLoading;
        },
        typeConfig(){
            if(this.config.tasktypes[this.task.tasktype]){
              return this.config.tasktypes[this.task.tasktype];
            }
            return this.config.tasktypes.default;
        },
        fieldsToShow() {
            if(!this.task) {
                return;
            }
            let fields = Object.keys(this.task.fields);
            if(!this.typeConfig.panel) {
                return;
            }
            let configFields = this.typeConfig.panel.fields || {};
            let hiddenFields = [];
            if(!configFields.exclude) {
                configFields.exclude = [];
            }
            if(!configFields.order) {
                configFields.order = [];
            }
            for (let field of fields) {
                if(this.task.fields[field].hidden) {
                   hiddenFields.push(field);
                }
            }
            let filterList = [...configFields.exclude, ...configFields.order, ...hiddenFields];
            let extraFields = fields.filter(function (field) {
                return filterList.indexOf(field) === -1;
            }).sort();
            return [...configFields.order, ...extraFields];
        }
    },
    methods: {
       togglePanelStatus() {
            this.$store.commit(mutations.TOGGLE_PANEL_STATE);
        },
        next() {
            this.$store.commit(mutations.SET_PANEL_NEXT_TASK);
        },
        prev() {
            this.$store.commit(mutations.SET_PANEL_PREV_TASK);
        },
        displayValue(field) {
           if(this.task.fields) {
               let taskField = this.task.fields[field];
               if(taskField) {
                   switch(taskField.type){
                       case 'date2':
                       if(!taskField.value)
                       return "";
                       return moment.unix(parseInt(taskField.value)).toDate().toLocaleDateString();
                       default:
                       return taskField.displayValue ? taskField.displayValue : taskField.value;
                   }
               }
                return '';
           }
        },
        description(field) {
            if(this.task.fields) {
                let taskField = this.task.fields[field];
                if(taskField) {
                    return taskField.description ? taskField.description : taskField.name;
                }
            }
            return '';
        }
    },
    beforeCreate() {
        this.$options.components.DetailPanelContent = require("../components/panels/content/DetailPanelContent.vue");
        this.$options.components.AttachmentPanelContent = require("../components/panels/content/AttachmentPanelContent.vue");
        this.$options.components.ChangesetPanelContent = require("../components/panels/content/ChangesetPanelContent.vue");
        this.$options.components.EditPanelContent = require("../components/panels/content/EditPanelContent.vue");
    }
};
</script>
