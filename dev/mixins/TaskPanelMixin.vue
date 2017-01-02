<script>
import * as mutations from '../store/mutation-types';

export default {
    props: ['task'],
    computed: {
        task() {
            return this.$store.state.taskGrid.panelState.taskToShow;
        },
        isActive() {
            return this.$store.state.taskGrid.panelState.active;
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
};
</script>
