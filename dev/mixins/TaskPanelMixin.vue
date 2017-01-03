<script>
import * as mutations from '../store/mutation-types';

export default {
    computed: {
        task() {
            return this.$store.state.taskGrid.panelState.taskToShow;
        },
        isActive() {
            return this.$store.state.taskGrid.panelState.active;
        },
        isEditMode() {
          return this.$store.state.taskGrid.panelState.isEditMode;
        }
    },
    methods: {
        togglePanelStatus() {
            this.$store.commit(mutations.TOGGLE_PANEL_STATE);
       },
       displayValue(field) {
           if(this.task.fields) {
                let taskField = this.task.fields[field];
                if (taskField.displayValue) {
                    return taskField.displayValue;
                }
                return taskField.value;
           }
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
