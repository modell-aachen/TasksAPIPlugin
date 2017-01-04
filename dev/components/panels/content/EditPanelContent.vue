<template>
<div v-if="taskToEdit">
    <select-component :fields="taskToEdit.fields" field-name="Type"></select-component>
    <text-component :fields="taskToEdit.fields" field-name="Title" placeholder="Aufgabentitel"></text-component>
    <task-editor-component :fields="taskToEdit.fields" field-name="Description"></task-editor-component>
    <button v-on:click="createTask">Save</button>
</div>
</template>

<script>
import TaskPanelMixin from "../../../mixins/TaskPanelMixin.vue";
import TextComponent from "../edit_components/TextComponent.vue";
import SelectComponent from "../edit_components/SelectComponent.vue";
import TaskEditorComponent from "../edit_components/TaskEditorComponent.vue";
import _ from 'lodash';
export default {
    data(){
        return {
            taskToEdit: null
        };
    },
    components: {
        TextComponent,
        SelectComponent,
        TaskEditorComponent
    },
    mixins: [TaskPanelMixin],
    methods: {
        createTask(){
            let request = {
                form: this.taskToEdit.form
            };
            for(let key in this.taskToEdit.fields){
                let currentField = this.taskToEdit.fields[key];
                request[key] = currentField.value;
            }
            request.AssignedTo = "AUTOGEN";
            this.$store.dispatch("createNewTask", request);
        }
    },
    created(){
        this.taskToEdit = _.cloneDeep(this.task);
    },
    mounted(){
    }
};
</script>

<style lang="sass">
</style>
