<template>
    <div>
        <h2>{{displayValue("Title")}}</h2>
        <p>{{displayValue("Description")}}</p>
    </div>
</template>

<script>
import TaskPanelMixin from "../../../mixins/TaskPanelMixin.vue";
export default {
    mixins: [TaskPanelMixin],
    methods: {
       displayValue() {
           return "test";
       }
    }
};
</script>

<style lang="sass">
</style>
